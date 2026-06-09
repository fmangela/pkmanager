# PKHeX.Core 升级方案：NuGet v24.3.10 → SDK 源码 v26.05.05

> **日期**: 2026-06-09  
> **状态**: 待专家评审  
> **目标**: 将 PKHeX.Core 内核从 NuGet 预编译包 v24.3.10 升级到 SDK 源码编译 v26.05.05，同时将项目框架从 .NET 8 升级到 .NET 10

---

## 一、动机

### 1.1 当前痛点

| 问题 | 说明 |
|------|------|
| **API 不可见** | NuGet v24.3.10 中 `PlayerBag` 为 `internal`，`SaveFile.Inventory` 返回 `IReadOnlyList<InventoryPouch>` 而非 `PlayerBag`，导致背包保存无法调用 `CopyTo()` 落盘，必须绕道 `InventoryPouchExtensions.SaveAll()` |
| **源码与运行时不一致** | SDK 源码已到 v26.05.05（`PlayerBag` 为 `public`、`MaxStringLengthTrainer` 属性名不同），但开发时只能靠反射猜测 NuGet DLL 的实际 API |
| **无法同步 PKHeX 更新** | PKHeX 每月发布新版本（新增 Pokémon ZA 支持、合法性规则更新等），当前锁定在 2024-03-10 版本，已落后 26 个月 |
| **类型安全缺失** | `TryGetIntProperty`/`TrySetIntProperty` 大量反射调用，无编译时类型检查 |
| **仓库内双版本并存** | 主服务引用 NuGet `PKHeX.Core 24.3.10`，辅助工具 `tools/ReflectPkhex` 也单独引用旧版包，导致“服务运行时 API”和“开发时反射看到的 API”长期不一致 |

### 1.2 目标收益

| 收益 | 说明 |
|------|------|
| **源码级 API 可见** | 改为项目引用后 IDE 可直接跳转到 PKHeX 源码，编译时检查类型签名 |
| **减少反射调用** | `PlayerBag` public → 直接调用 `inventory.GetPouch()`、`inventory.CopyTo(sav)`；但训练家/徽章/BP 等字段仍需保留一层按存档类型分派的兼容适配层 |
| **持续更新能力** | SDK 是 git 仓库，`git pull` 即可同步 PKHeX 最新版本，自行编译即可 |
| **Pokémon ZA 支持** | v26.x 包含 Gen9 ZA 的完整存档支持 |

---

## 二、现状分析

### 2.1 当前技术栈

| 组件 | 当前版本 | 目标框架 |
|------|---------|---------|
| .NET SDK | 8.0.421 | — |
| 项目目标框架 | `net8.0` | `net10.0` |
| PKHeX.Core | NuGet v24.3.10 (net8.0) | SDK 源码 v26.05.05 (net10.0) |
| Npgsql | 10.0.3 | net8.0/net9.0/**net10.0** ✅ |
| Dapper | 2.1.79 | netstandard2.0 ✅ |
| BCrypt.Net-Next | 4.2.0 | netstandard2.0 ✅ |
| Swashbuckle.AspNetCore | 6.6.2 | 需升级到 10.2.1 |
| Microsoft.AspNetCore.Authentication.JwtBearer | 8.0.15 | 需升级到 10.0.x |
| Microsoft.AspNetCore.OpenApi | 8.0.27 | 需升级到 10.0.x |

### 2.2 .NET 10 环境

- **最新 Runtime**: 10.0.8（2026-05-12）
- **最新 SDK**: 10.0.300
- **支持周期**: LTS（End of Support: 2028-11-14）
- **C# 语言版本**: 14
- **当前机器**: 仅安装 .NET 8.0 SDK，需新增 .NET 10.0 SDK

---

## 三、升级步骤

### 3.1 安装 .NET 10 SDK

```bash
# Ubuntu 22.04 — 安装 .NET 10 SDK（与现有 .NET 8 并存）
curl -sSL https://dot.net/v1/dotnet-install.sh | bash /dev/stdin --channel 10.0 --install-dir ~/.dotnet

# 验证
dotnet --list-sdks
# Expected: 8.0.421 + 10.0.300
```

> .NET SDK 支持多版本并存，`global.json` 控制项目使用哪个版本。开发机可同时保留 8.0 和 10.0。

### 3.2 项目框架升级

**文件**: `server/PkManager.Server/PkManager.Server.csproj`

```diff
- <TargetFramework>net8.0</TargetFramework>
+ <TargetFramework>net10.0</TargetFramework>
```

**NuGet 包版本更新**:

```diff
- <PackageReference Include="PKHeX.Core" Version="24.3.10" />
+ <!-- 改为项目引用，见 3.3 -->

- <PackageReference Include="Microsoft.AspNetCore.Authentication.JwtBearer" Version="8.0.15" />
+ <PackageReference Include="Microsoft.AspNetCore.Authentication.JwtBearer" Version="10.0.8" />

- <PackageReference Include="Microsoft.AspNetCore.OpenApi" Version="8.0.27" />
+ <PackageReference Include="Microsoft.AspNetCore.OpenApi" Version="10.0.8" />

- <PackageReference Include="Swashbuckle.AspNetCore" Version="6.6.2" />
+ <PackageReference Include="Swashbuckle.AspNetCore" Version="10.2.1" />

  <!-- 以下包无需变更，已支持 net10.0 或 netstandard2.0 -->
  <!-- Npgsql 10.0.3 已内置 net10.0 target -->
  <!-- Dapper 2.1.79 (netstandard2.0) -->
  <!-- BCrypt.Net-Next 4.2.0 (netstandard2.0) -->
```

### 3.3 PKHeX.Core 引用方式变更

**从 NuGet 引用改为 SDK 源码项目引用**:

```diff
- <PackageReference Include="PKHeX.Core" Version="24.3.10" />
+ <ProjectReference Include="../../sdk/PKHeX/PKHeX.Core/PKHeX.Core.csproj" />
```

**新增 `global.json`**（锁定 SDK 版本）:

> **放置位置**: 仓库根目录 `pkmanager/global.json`，不要放在 `server/PkManager.Server/` 子目录。  
> 原因：需要同时覆盖以下两类命令：
> - 从仓库根执行的 `dotnet build server/PkManager.Server/...`
> - `start-dev.sh` 中先 `cd server/PkManager.Server` 再执行的 `dotnet run`

```json
{
  "sdk": {
    "version": "10.0.300",
    "rollForward": "latestFeature"
  }
}
```

**SDK 版本管理策略**:
- `sdk/PKHeX/` 保持 git 跟踪，定期 `git pull` 同步上游
- 每次同步后重建项目，编译器会暴露 API 变更
- 重大更新前在分支上测试

### 3.4 同步升级辅助工具项目

当前仓库内还有一个直接依赖旧版 `PKHeX.Core` 的辅助工具：

- `tools/ReflectPkhex/ReflectPkhex.csproj`

它必须和主服务一起升级，否则仓库内会继续并存两套不同版本的 PKHeX API 视图。

**建议改法**:

```diff
- <TargetFramework>net8.0</TargetFramework>
+ <TargetFramework>net10.0</TargetFramework>

- <PackageReference Include="PKHeX.Core" Version="24.3.10" />
+ <ProjectReference Include="../../sdk/PKHeX/PKHeX.Core/PKHeX.Core.csproj" />
```

如果后续还保留该工具用于 API 探测，必须保证它和 `server/PkManager.Server` 指向同一份 `sdk/PKHeX` 源码。

---

## 四、PKHeX API 变更影响分析

### 4.1 对我们有利的变更（简化现有代码）

| 变更 | v24.3.10 (NuGet) | v26.05.05 (SDK) | 影响 |
|------|-----------------|-----------------|------|
| `SaveFile.Inventory` 返回类型 | `IReadOnlyList<InventoryPouch>` | `PlayerBag` (public) | `SaveBag()` 可直接调用 `inventory.GetPouch()`、`inventory.CopyTo(sav)`，不再需要绕道 `SaveAll` 扩展 |
| OT 名称最大长度属性 | `MaxStringLengthOT` | `MaxStringLengthTrainer` | 属性名变更（还原） |
| `PlayerBag` 可见性 | `internal` | `public` | 可直接使用 `GetMaxCount(type, itemIndex)` 获取按道具上限 |

### 4.2 需要适配的变更

| 变更 | 影响范围 | 说明 |
|------|---------|------|
| `IItemFreeSpace` → 可能拆分/重命名 | `BagDto`, `SaveFileService.GetBag()` | SDK v26 中接口可能变化，需重读源码确认 |
| `GameVersion` 枚举新增值 | `SaveFileService.GetBadgeInfo()` | v26 新增 ZA 等游戏版本，switch 表达式需补充分支 |
| `SAV9ZA` 新存档类型 | `ParseService.OpenSaveFile()` | PKHeX 自动识别，一般无需改动，但需测试 |
| ASP.NET 10.0 行为变更 | `Program.cs` | JWT Bearer / OpenApi 配置可能需微调 |
| Swashbuckle 6.x → 10.x 破坏性 API 变更 | `Program.cs` | `AddSwaggerGen()` / `UseSwaggerUI()` 配置方式已变化，需对照新文档改写 |
| 训练家字段仍然异构 | `SaveFileService.GetTrainerInfo()/SaveTrainerInfo()` | `Badges`/`BP`/`LeaguePoints`/`Coins` 并未统一在单一基类属性上，不能简单“删光反射”，需要按 `SAV4`/`SAV6`/`SAV7`/`SAV8SWSH`/`SAV9SV` 分派 |

### 4.3 兼容层策略（重要）

升级后**不要直接把所有反射访问器删掉**，而应先收敛为一个小型兼容适配层，例如：

```csharp
internal static class PkhexSaveAdapters
{
    public static int? GetBadges(SaveFile sav) => sav switch
    {
        SAV6 s6 => s6.Badges,
        SAV8SWSH s8 => s8.Badges,
        SAV4 s4 => s4.Badges,
        SAV3 s3 => s3.Badges,
        SAV2 s2 => s2.Badges,
        SAV1 s1 => s1.Badges,
        _ => null,
    };

    public static int? GetBP(SaveFile sav) => sav switch
    {
        SAV6 s6 => s6.BP,
        SAV7 s7 => (int)s7.Misc.BP,
        SAV8SWSH s8 => s8.BP,
        SAV4 s4 => s4.BP,
        _ => null,
    };

    public static uint? GetLeaguePoints(SaveFile sav) => sav switch
    {
        SAV9SV s9 => s9.LeaguePoints,
        _ => null,
    };
}
```

这样做的好处：
- 背包 API 可以彻底类型安全化
- 训练家字段的异构访问被集中到一个地方
- 后续 PKHeX 升级时，只需在 adapter 层补分支，不会把条件分散到业务代码各处

### 4.4 可删除或收缩的临时代码

升级后以下代码可以**部分移除或显著收缩**：

```csharp
// SaveFileService.cs
// 这些“字符串属性名 + 反射”访问器不应继续扩散；
// 但应先由强类型 adapter 替代，而不是机械删除。
private static int? TryGetIntProperty(object obj, string propName)
private static void TrySetIntProperty(object obj, string propName, int value)
```

`SaveBag()` 中的 `inventory.SaveAll(sav.Data)` → 改为 `inventory.CopyTo(sav)`（通过 `PlayerBag` 公开 API）。

---

## 五、后端代码变更清单

### 5.1 SaveFileService.cs

| 方法 | 变更 |
|------|------|
| `GetBag()` | `sav.Inventory.Pouches` → `sav.Inventory` 即 `PlayerBag`，可直接迭代 `.Pouches` |
| `GetTrainerInfo()` | `MaxStringLengthOT` → `MaxStringLengthTrainer` |
| `SaveBag()` | `inventory.SaveAll(sav.Data)` → `sav.Inventory.CopyTo(sav)` |
| `GetTrainerInfo()` | 背包/训练家能力检测改为强类型 API + adapter |
| `SaveTrainerInfo()` | 将 `TrySetIntProperty` 收敛为 `PkhexSaveAdapters`，而不是分散在业务逻辑中 |
| `GetBadgeInfo()` | switch 表达式补充 Gen9 ZA 分支 |

### 5.2 ParseService.cs

| 方法 | 变更 |
|------|------|
| `MapToPokemonDto()` | 新增 v26 专有字段映射（如 ZA 形态参数等） |

### 5.3 其他后端/工具范围

- `PokemonEditService.cs` — 新版本 PKHeX 可能新增/重命名接口，反射访问器需逐字段验证
- `PokemonEditRequest.cs` / `SaveFileDto.cs` — 确认 DTO 字段与 PKHeX v26 的类型对齐
- `PokemonController.cs` / `BankService.cs` / `ResourceController.cs` / `GameVersionNormalizer.cs` — 都直接依赖 `PKHeX.Core`，必须纳入编译与冒烟验证范围
- `tools/ReflectPkhex` — 必须同步升级到 `net10.0` + `ProjectReference`

---

## 六、风险评估

| 风险 | 严重度 | 缓解措施 |
|------|--------|---------|
| .NET 10 运行时在生产环境不可用 | 高 | 先在开发机验证；生产部署前确认目标服务器已安装 .NET 10 runtime |
| ASP.NET 10.0 行为变更导致 JWT 认证/OpenApi 异常 | 中 | 升级后运行 `./check-health.sh` 全栈诊断 |
| PKHeX v26 API 变更导致编译错误 | 中 | 逐个编译错误修复，预计 20-40 个编译错误，逐个处理 |
| 仓库内仍残留旧版 PKHeX.Core 引用 | 中 | 同步升级 `tools/ReflectPkhex`，并用 `rg "PKHeX.Core"` 全仓检查残留引用 |
| `global.json` 放错位置导致命令使用错误 SDK | 中 | 明确放在仓库根目录，并验证“仓库根 build”和脚本启动”两条路径 |
| Npgsql 10.0.3 在 net10.0 下有兼容问题 | 低 | 已验证 Npgsql 10.0.3 内置 net10.0 target |
| PostgreSQL 14 与 .NET 10 驱动的兼容性 | 低 | Npgsql 向后兼容，PostgreSQL 14 不受 .NET 版本影响 |
| 前端无需变更 | 无 | 前后端通过 HTTP/JSON 通信，后端框架升级不影响前端 |
| `sdk/PKHeX/` git 状态与项目不同步 | 低 | 在升级文档中记录当前 SDK commit hash，可回滚到已知良好版本 |

---

## 七、回滚方案

如果升级后出现问题，回滚步骤：

```bash
# 1. 恢复 csproj 到 net8.0 + NuGet 引用
git checkout server/PkManager.Server/PkManager.Server.csproj
git checkout tools/ReflectPkhex/ReflectPkhex.csproj

# 2. 删除仓库根目录 global.json
rm /home/fmangela/pkmanager/global.json

# 3. 切回 .NET 8 SDK
# global.json 删除后自动使用机器默认 SDK（8.0.421）

# 4. 重新编译
cd server/PkManager.Server && dotnet restore && dotnet build
```

> 整个回滚过程 < 5 分钟，前提是代码改动已通过 git 管理。

---

## 八、实施计划

| 阶段 | 内容 | 预计耗时 |
|------|------|---------|
| 1 | 安装 .NET 10 SDK，验证 `dotnet --info` | 10 分钟 |
| 2 | 修改 `server/PkManager.Server` + `tools/ReflectPkhex` csproj（框架版本 + 引用方式） | 20 分钟 |
| 3 | 新增仓库根 `global.json`，验证根目录/脚本两种运行路径 | 10 分钟 |
| 4 | `dotnet restore` + 修复编译错误（预计 20-40 个） | 2-4 小时 |
| 5 | 修改 `SaveFileService`（背包改用 `PlayerBag.CopyTo`，训练家字段下沉到 adapter） | 1-2 小时 |
| 6 | 修改 `ParseService`、`PokemonEditService`、`BankService`、`ResourceController`（新字段与 API 适配） | 1-3 小时 |
| 7 | 运行 `./check-health.sh` + 冒烟测试 + 辅助工具 `dotnet run --project tools/ReflectPkhex/...` | 45 分钟 |
| 8 | 前端 `npm run build` 验证（预期不变） | 5 分钟 |
| 9 | 更新 `CLAUDE.md` 和 `TODOLIST.md` | 15 分钟 |

**总计**: 约 1-2 个工作日

---

## 九、依赖与前置条件

- [ ] 专家评审通过本方案
- [ ] 确认生产服务器可安装 .NET 10 Runtime（10.0.8）
- [ ] `sdk/PKHeX/` 工作区干净（无未提交修改）
- [ ] 当前分支所有改动已提交

---

## 附录 A：NuGet 包兼容性矩阵

| 包名 | 当前版本 | 升级后版本 | 目标框架 | 兼容性 |
|------|---------|-----------|---------|--------|
| PKHeX.Core | 24.3.10 | SDK 源码 v26.05.05 | net10.0 | ✅ 项目引用 |
| Npgsql | 10.0.3 | 10.0.3（不变） | net8.0/9.0/10.0 | ✅ |
| Dapper | 2.1.79 | 2.1.79（不变） | netstandard2.0 | ✅ |
| BCrypt.Net-Next | 4.2.0 | 4.2.0（不变） | netstandard2.0 | ✅ |
| Swashbuckle.AspNetCore | 6.6.2 | 10.2.1 | net10.0 | ⚠️ 需升级 |
| JwtBearer | 8.0.15 | 10.0.8 | net10.0 | ⚠️ 需升级 |
| OpenApi | 8.0.27 | 10.0.8 | net10.0 | ⚠️ 需升级 |

## 附录 B：PKHeX SDK 版本锁定

```
SDK 路径:   sdk/PKHeX/
当前 commit: 5767ab85c (v26.05.05-44-g5767ab85c)
NuGet 等价:  v26.5.5
远程仓库:    https://github.com/kwsch/PKHeX
更新命令:    cd sdk/PKHeX && git pull origin master
实施前锁定:  cd sdk/PKHeX && git tag pkmanager-baseline 5767ab85c
```
