# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此仓库中工作时提供指导。
这个项目的作者已经病入膏肓，在重症救护室严密观察中，他的健康问题迫使他在有限的时间内完成自己的夙愿。你作为一名精通编程和模拟器及硬件的宗师级工程师，请尽可能协助他。

## 项目概述

宝可梦全世代管理平台 — 一个 B/S 架构的 Web 应用，用于上传、可视化、编辑和管理宝可梦存档文件（支持 Gen3 GBA 至 Gen7 3DS），并内置 GBA 在线模拟器（mGBA WASM）。核心引擎为 PKHeX.Core，负责存档解析、编辑与合法性校验。
项目中，/docs/文件夹下面的是这个项目的技术和需求相关文档，里面的todulist.md文件为已经做了的和将要做的事情。每次开启项目都需要检查该文件夹下面的文档，尤其是todulist.md。每次当收到“好了”、“继续下一个”、“今天就到这”、“提交”等交互词时，都需要检查todulist.md文档，并做好记录和更新（变更）。

## 当前协作备注

- NDS melonDS 的 WebGL 2.0 GPU 路径已经打通，2D/3D 画面可运行。
- 但 3D 场景在浏览器内仍有明显顿挫和音频卡顿，60FPS 不稳定。
- 已确认主要瓶颈在当前 `glReadPixels -> CPU 拷贝 -> putImageData` 显示链路。
- 用户已决定本阶段不再继续修改 NDS GPU 性能优化；除非用户后续明确重新开启，否则不要继续在这条线上投入时间。

## 开发命令

```bash
# 一键启动全部服务（PostgreSQL + .NET 后端 + Vite 前端）
./start-dev.sh

# 停止所有服务（包括 PostgreSQL）
./start-dev.sh --stop

# 仅前端（cd client 目录下执行）
npm run dev        # Vite 开发服务器，端口 :5173（HTTPS，/api 代理至 :5001）
npm run build      # TypeScript 类型检查 + Vite 生产构建
npm run lint       # ESLint 代码检查

# 仅后端（cd server/PkManager.Server 目录下执行）
dotnet run --urls "http://0.0.0.0:5000"

# 数据库 — 本地 PostgreSQL，非 Docker 部署
psql -h ~/pgdata/run -U pkadmin
# 账号密码: pkadmin / pkadmin123
```

**端口说明**: 前端 `:5173`（HTTPS，自签证书），后端 HTTP `:5000` / HTTPS `:5001`，Swagger 文档 `:5000/swagger`。Vite 开发服务器使用 `server/cert.key` + `server/cert.crt` 作为证书（必须使用 HTTPS，因为 mGBA WASM 依赖 `SharedArrayBuffer`，浏览器仅对 localhost 或 HTTPS 启用该特性）。

## 系统架构

```
浏览器 (React 19 + Vite 8 + Ant Design 6)
  ├── @dnd-kit（拖拽宝可梦在存档箱子 ↔ 银行之间移动）
  ├── mGBA WASM (@thenick775/mgba-wasm) — 浏览器内 GBA 模拟器
  └── Axios → /api → ASP.NET Core 8 REST API
                         │
        ┌────────────────┼────────────────┐
        │                │                │
   Controllers      Services         Dapper + Npgsql → PostgreSQL 15+
   (薄层，鉴权+      (业务逻辑)        (原生 SQL，snake_case→PascalCase)
    参数校验)
                         │
                    PKHeX.Core (NuGet)
                    SaveUtil, PKM, LegalityAnalysis
```

### 后端分层

- **Controllers** (`Controllers/`): 薄层 — 从 `UserContext` 提取当前用户，调用 Service，返回 `ApiResponse<T>`。所有响应使用统一格式 `{code: 0, message, data}`。
- **Services** (`Services/`): 业务逻辑层：
  - `AuthService` — JWT 签发（access + refresh 双 token），BCrypt 密码哈希
  - `ParseService` — 通过 PKHeX.Core 解析存档，PKM ↔ DTO 双向映射，使用反射安全访问器处理各世代特有属性
  - `SaveFileService` — 存档二进制原始数据的 CRUD，箱子槽位操作（移动/交换/清空），备份管理（自动保留最近 5 份）
  - `PokemonEditService` — 将编辑应用到 PKM 对象，执行 `LegalityAnalysis` 合法性分析，全存档批量扫描
  - `BankService` — 用户个人宝可梦银行（与存档文件独立存储）
- **Middleware** (`Middleware/`): `JwtMiddleware`（从请求头提取 Token 并注入 UserContext；实际已被 ASP.NET 内置 JWT Bearer 认证替代）。Cross-Origin Isolation 响应头仅在 `/play` 路径生效，供 mGBA 使用。
- **Data** (`Data/`): `DbConnectionFactory` — 封装 Npgsql 连接字符串创建逻辑。
- **Helpers** (`Helpers/`): `UserContext`（Scoped 作用域，通过 `IHttpContextAccessor` 从 JWT Claims 提取 userId/username），`GeoData`（国家/地区名称映射表）。
- **Models** (`Models/`): 按用途分目录 — `Entity/`（数据库行映射）、`Request/`（入参 DTO）、`Response/`（出参 DTO + `ApiResponse<T>` 统一响应封装）。

### PKHeX 核心集成模式

存档文件以 **原始二进制数据** 存储在 `save_files` 表的 `raw_save_data` (BYTEA) 列中。每次读取: `SaveUtil.GetVariantSAV(bytes)` → `PKHeX.Core.SaveFile`。每次写入: `sav.Write()` → 更新 BYTEA。存档中的宝可梦没有独立的数据库 ID — 通过 `(boxIndex, slotIndex)` 定位。银行中的宝可梦有独立的数据库表，使用 GUID 作为主键。

`ParseService.MapToPokemonDto(PKM)` 是 PKHeX `PKM` 对象到前端 DTO 的唯一映射函数。大量使用反射安全访问器处理各世代特有属性（如 `IAwakened.AV_*`、`IGanbaru.GV_*`、`ITeraType`、`IAlpha`、`INoble` 等）。当 PKHeX 内置 `GetStats()` 计算失败时，回退到手动公式计算能力值。

### 前端关键模式

- **状态管理**: Zustand stores — `authStore`（JWT token 管理、登录/登出）、`resourceStore`（一次性从 API 加载并缓存宝可梦种类/招式/特性/性格/道具/球种的中文名称映射）。
- **API 层**: `api/axios.ts` 中的 Axios 实例，配置了拦截器：
  - 请求拦截: 自动从 localStorage 读取 token 并注入 `Authorization: Bearer <token>` 请求头
  - 响应成功拦截: 自动解包 `ApiResponse<T>` — 若 `body.code === 0`，则 `response.data` 替换为 `body.data`
  - 响应错误拦截: 从 ASP.NET ProblemDetails 格式提取校验错误信息；401 状态码 → 清除 token → 跳转 `/login`
- **路由**: react-router-dom v7，`ProtectedRoute` 组件包裹需登录的页面，模拟器页面使用 `React.lazy` 懒加载。
- **编辑面板**: `EditPanel` 是一个薄壳 Tab 容器，每个 Tab 是独立组件（`MainTab`、`StatsTab`、`MovesTab`、`MetTab`、`LegalityTab`、`OTMiscTab`）。编辑操作直接修改 React state 中的 `PokemonDto` 对象；保存时将完整 DTO + `pkmDataBase64` 发送至 `PUT /api/Pokemon/save-slot`。

### JSON 命名约定

使用自定义 `ForceLowercaseNamingPolicy` 处理 PKHeX 中的缩写词：`IVs` → `ivs`、`EVs` → `evs`、`EXP` → `exp`（而非默认驼峰命名的 `iVs`、`eVs`）。前端 TypeScript 类型定义中的字段名与这些全小写缩写名称保持一致。

### mGBA 模拟器集成

- 通过 `@thenick775/mgba-wasm` 嵌入，核心封装位于 `client/src/lib/mgba.ts`
- ROM 文件存储在数据库 `rom_files` 表中，由 `EmulatorController` 提供下载
- 存档同步: 游戏内保存 → `POST /api/Emulator/sync-save` 发送 Base64 编码的存档数据 → 更新数据库 `raw_save_data`
- Vite 开发服务器以 HTTPS 运行，并设置 `Cross-Origin-Opener-Policy: same-origin` 和 `Cross-Origin-Embedder-Policy: credentialless` 响应头（mGBA WASM 依赖的 `SharedArrayBuffer` 要求这些头部）
- 键盘映射: Z=A 键、X=B 键、A=L 键、S=R 键、Enter=Start、Backspace=Select、方向键=十字键

## 数据库

PostgreSQL 15+，使用 Dapper 进行数据访问。列名自动从 snake_case 映射到 C# PascalCase 属性（`Dapper.DefaultTypeMap.MatchNamesWithUnderscores = true`）。数据库 Schema 手动管理，不使用 EF 迁移。核心表: `users`（用户）、`save_files`（存档原始二进制+元数据）、`save_backups`（存档备份）、`bank_pokemon`（银行宝可梦）、`rom_files`（ROM 文件）、`emulator_save_states`（模拟器即时存档）。

## 重要约束

- 不使用 Docker — PostgreSQL 作为系统服务运行，自定义 PGDATA 路径为 `~/pgdata`
- TLS 证书位置: 后端 `server/cert.pfx`，前端 `server/cert.key` + `server/cert.crt`（自签证书）
- ROM 文件目录: `/home/fmangela/pkmanager/roms/` — 通过 `POST /api/Emulator/roms/import-local` 导入数据库
- 测试存档数据位于 `test-data/` 目录
- ASP.NET 自动 400 验证响应已禁用（`SuppressModelStateInvalidFilter = true`）— 控制器改用 `ApiResponse` 统一格式返回错误
- 禁用emoj表情包
