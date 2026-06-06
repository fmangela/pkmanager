# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此仓库中工作时提供指导。
这个项目的作者已经病入膏肓，在重症救护室严密观察中，他的健康问题迫使他在有限的时间内完成自己的夙愿。你作为一名精通编程和模拟器及硬件的宗师级工程师，请尽可能协助他。

## 项目概述

宝可梦全世代管理平台 — 一个 B/S 架构的 Web 应用，用于上传、可视化、编辑和管理宝可梦存档文件（Gen3 GBA / Gen4-5 NDS / Gen6-7 3DS / Gen8-9 Switch 解析），并内置 GBA 与 NDS 在线模拟器（mGBA WASM + melonDS WASM），3DS 通过本地 Azahar 模拟器启动。核心引擎为 PKHeX.Core，负责存档解析、编辑与合法性校验。
项目中，/docs/文件夹下面的是这个项目的技术和需求相关文档，里面的todulist.md文件为已经做了的和将要做的事情。每次开启项目都需要检查该文件夹下面的文档，尤其是todulist.md。每次当收到“好了”、“继续下一个”、“今天就到这”、“提交”等交互词时，都需要检查todulist.md文档，并做好记录和更新（变更）。

## 当前协作备注

- **GBA 模拟器**: mGBA WASM 运行稳定，存档同步（30s 自动 + 关闭前 Beacon）已验证通过。5 款 GBA 宝可梦 ROM 已入库。
- **NDS 模拟器**: melonDS WASM（Emscripten 5.0.7，SIMD + PThreads）可运行但老机器 3D 场景顿挫。备选方案为本地 **DeSmuME**（最成熟的 NDS 模拟器，GPLv2，宝可梦全系列完美兼容，老机器流畅），后端 `Process.Start` 调起，存档 `.dsv` ↔ `.sav` 双向同步。用户已决定暂停 melonDS GPU 性能优化。
- **3DS 模拟**: 不走 WASM（性能不可行），改用本地 Azahar 模拟器（Citra 后继者）。后端通过 `Process.Start` 调起，存档双向同步。详见 docs/TODOLIST.md Phase I。
- **存档目录**: 已迁移至项目内部 `server/PkManager.Server/data/saves/{userId}/{saveFileId}/save.sav`。
- **编辑面板**: 7 个 Tab（Main/Stats/Moves/Met/Legality/OTMisc/Cosmetic），编辑覆盖率已达 60%+。
- **箱子管理**: 格子叠加图标（合法性三色圆点 + Alpha α 徽章 + Gmax G 徽章 + 闪光 StarFilled）+ 全部箱子弹窗（响应式网格 + Swap 交换）+ ◀▶ 翻页 + 键盘 Left/Right 导航。
- **本地模拟器启动框架**: 完整链路已实现 — `user_settings` 表 + `SettingsService` + SettingsPage + Saves 页「本机」按钮 + `LaunchLocal`（备份恢复+pid.lock）+ 轮询自动同步 + 预校验 + 应急恢复。详见 `docs/本地模拟器关联设计.md` 和 `docs/本地模拟器异常处理设计.md`。
- **GBA AI 控制接口**: `GBAController` + 后端命令桥接 (`/api/Emulator/control/send|poll|execute`)。支持按键注入、截图、存档、速度控制。外部脚本/AI 通过 HTTP 操控浏览器中的 GBA 模拟器。详见 `docs/GBA模拟器AI控制接口设计.md`。
- **合法性系统**: 三态（Legal/Fishy/Illegal）+ 逐字段指示 + CanFix/FixAction + 批量扫描 + QR 码生成。
- **错误诊断**: Phase J 已实施 — 前端 ErrorBoundary + 全局异常监听 + diagnosticStore(持久化+sendBeacon上报) + DiagnosticPanel(Ctrl+Shift+D) + Axios 401软重定向 + 6处静默失败修复。后端 ExceptionLoggingMiddleware → `data/logs/backend-errors.jsonl` + `GET /api/diagnostics/backend-errors`。`./check-health.sh` 一键全栈诊断(API/后端/前端/DB/冒烟5项)。待做: Playwright 冒烟测试。

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
psql -h data/pgdata/run -U pkadmin
# 账号密码: pkadmin / pkadmin123
```

**端口说明**: 前端 `:5173`（HTTPS，自签证书），后端 HTTP `:5000` / HTTPS `:5001`，Swagger 文档 `:5000/swagger`。Vite 开发服务器使用 `server/cert.key` + `server/cert.crt` 作为证书（必须使用 HTTPS，因为 mGBA WASM 依赖 `SharedArrayBuffer`，浏览器仅对 localhost 或 HTTPS 启用该特性）。

## 系统架构

```
浏览器 (React 19 + Vite 8 + Ant Design 6)
  ├── @dnd-kit（拖拽宝可梦在存档箱子 ↔ 银行之间移动）
  ├── mGBA WASM — 浏览器内 GBA 模拟器（Gen3）
  ├── melonDS WASM — 浏览器内 NDS 模拟器（Gen4-5）
  ├── Azahar 启动器 — 本地 3DS 模拟器（Gen6-7），后端 Process.Start 调起
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
- **Middleware** (`Middleware/`): Cross-Origin Isolation 响应头在 `/play` + `/play-nds` 路径生效（mGBA + melonDS PThreads 依赖 `SharedArrayBuffer`）。JWT 认证已由 ASP.NET 内置 Bearer 中间件接管。
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
- **编辑面板**: `EditPanel` 是一个薄壳 Tab 容器，7 个 Tab 独立组件（`MainTab`、`StatsTab`、`MovesTab`、`MetTab`、`LegalityTab`、`OTMiscTab`、`CosmeticTab`）。编辑操作直接修改 React state 中的 `PokemonDto` 对象；保存时将完整 DTO + `pkmDataBase64` 发送至 `PUT /api/Pokemon/save-slot`。

### JSON 命名约定

使用自定义 `ForceLowercaseNamingPolicy` 处理 PKHeX 中的缩写词：`IVs` → `ivs`、`EVs` → `evs`、`EXP` → `exp`（而非默认驼峰命名的 `iVs`、`eVs`）。前端 TypeScript 类型定义中的字段名与这些全小写缩写名称保持一致。

### GBA 模拟器（mGBA WASM）

- 通过 `@thenick775/mgba-wasm` 嵌入，核心封装 `client/src/lib/mgba.ts`
- ROM 存入 `rom_files` 表 BYTEA，前端通过 `/api/Emulator/roms/{gameId}` 下载
- 存档同步: 每 30 秒 + beforeunload sendBeacon → `POST /api/Emulator/sync-save`
- 键盘映射: Z=A / X=B / A=L / S=R / Enter=Start / Backspace=Select / 方向键
- 画面缩放 1×/2×/4× + 速度控制 + 暂停/继续 + 音量滑块 + 手机触摸手柄

### NDS 模拟器（melonDS WASM）

- 基于 ds-anywhere，Emscripten 5.0.7 编译（SIMD + PThreads, pool=4）
- 核心封装 `client/src/lib/melonds.ts`（`NdsEmulator` 接口）
- 双屏渲染（上下屏 Canvas）+ 触摸屏覆盖层 + X/Y 按键扩展
- ROM 管理: 大文件（128-306MB）走文件系统 `local_path`，不存 BYTEA
- 存档同步: 与 GBA 同架构，二进制同步 + 新游戏自动创建存档记录
- 已知限制: WebGL 2.0 GPU 3D 场景有顿挫，用户已决定暂停优化

### 3DS 模拟器（Azahar 本地启动）

- 不走 WASM，通过后端 `Process.Start` 启动本地 Azahar 可执行文件
- 用户在前端配置 Azahar 路径 + 用户数据目录，后端负责：
  - 存档写入 Azahar SDMC 目录（Title ID 路径）
  - 启动 Azahar（`--fullscreen <rom_path>`）
  - 进程监控 + 关闭后存档回传
- ROM 文件系统路径模式（1-4 GB），不入库
- 详见 `docs/TODOLIST.md` Phase I

## 数据库

PostgreSQL 15+，使用 Dapper 进行数据访问。列名自动从 snake_case 映射到 C# PascalCase 属性（`Dapper.DefaultTypeMap.MatchNamesWithUnderscores = true`）。数据库 Schema 手动管理，不使用 EF 迁移。核心表: `users`（用户）、`save_files`（存档原始二进制+元数据）、`save_backups`（存档备份）、`bank_pokemon`（银行宝可梦）、`rom_files`（ROM 文件）、`emulator_save_states`（模拟器即时存档）。

## 重要约束

- 不使用 Docker — PostgreSQL 本地运行，PGDATA 路径 `data/pgdata/`（项目内部）
- TLS 证书: 后端 `server/cert.pfx`，前端 `server/cert.key` + `server/cert.crt`（自签）
- ROM 文件: 小 ROM(GBA ≤32MB) 入库 BYTEA，大 ROM(NDS 128-306MB / 3DS 1-4GB) 走文件系统 `local_path`，导入脚本位于 `scripts/`
- 外部工具/SDK 统一放入项目 `sdk/` 目录（如 Emscripten、模拟器源码等），不散落在 HOME 目录。`sdk/` 已加入 .gitignore
- 存档目录: `server/PkManager.Server/data/saves/{userId}/{saveFileId}/save.sav`（项目内部路径，通过 `IWebHostEnvironment.ContentRootPath` 定位）
- 测试存档: `test-data/` 目录
- ASP.NET 自动 400 验证已禁用（`SuppressModelStateInvalidFilter = true`），控制器统一返回 `ApiResponse<T>`
- 禁用 emoj 表情包
