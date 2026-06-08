# pkmanager 解耦分析报告 — GitHub 发布准备

> **日期**: 2026-06-08
> **目标**: 梳理项目与本地环境的强耦合点，提出解耦方案，使项目可被社区开发者 clone 后直接运行。
> **不变核心**: 浏览器模拟内核（mGBA WASM、melonDS WASM）、本地 Azahar/DeSmuME 启动器、PKHeX.Core 编辑核心 — 这些不在此次解耦范围内。

---

## 1. 耦合度总览

| 耦合维度 | 严重程度 | 涉及文件数 | 是否阻止开源 |
|----------|----------|-----------|-------------|
| 硬编码绝对路径 | 🔴 严重 | ~8 | **是** — 项目仅能在作者机器上运行 |
| 数据库连接字符串硬编码 | 🔴 严重 | 3 | **是** — 每个部署者需手动改 |
| 中文硬编码（无 i18n） | 🟡 中等 | ~35 | 否 — 但不国际化社区参与受限 |
| ROM 资源耦合 | 🟡 中等 | 5 | 否 — 但需文档说明 |
| 配置管理散落 | 🟡 中等 | ~10 | 否 — 但易用性差 |
| PostgreSQL 强绑定 | 🟢 低 | 全库 | 否 — Dapper 已提供抽象层 |
| 模拟器 WASM 文件 | 🟢 低 | 2 | 否 — 已放入 public/ |

---

## 2. 🔴 严重耦合：硬编码绝对路径

### 2.1 问题清单

| 位置 | 硬编码内容 | 影响 |
|------|-----------|------|
| `vite.config.ts:10-11` | `https.key: '/home/fmangela/pkmanager/server/cert.key'` | 其他开发者无法启动前端 |
| `vite.config.ts:11` | `https.cert: '/home/fmangela/pkmanager/server/cert.crt'` | 同上 |
| `appsettings.json:10` | `Host=/home/fmangela/pkmanager/data/pgdata/run` | 其他开发者无法连接数据库 |
| `Program.cs:18` | `UseHttps('/home/fmangela/pkmanager/server/cert.pfx', 'pkmanager123')` | PFX 路径硬编码 |
| `EmulatorController.cs:70` | `romDir = "/home/fmangela/pkmanager/roms"` | ROM 导入只能从作者目录 |
| `localLaunch.ts:358` | 后端 base URL 检测逻辑仅支持 `:5173` 端口 | 非标准端口部署时 break |

### 2.2 解耦方案

#### 方案 A: 环境变量 + 相对路径（推荐）

```
所有路径统一改为:
  1. 先读环境变量 (PKM_* 前缀)
  2. 未设置时回退到相对项目根路径
  3. 项目根路径通过 Path.Combine(AppContext.BaseDirectory, "../../../..") 动态计算
```

**具体改造**:

```csharp
// Program.cs — 证书路径
var certPath = Environment.GetEnvironmentVariable("PKM_CERT_PATH") 
    ?? Path.Combine(AppContext.BaseDirectory, "../../../..", "server/cert.pfx");
var certPassword = Environment.GetEnvironmentVariable("PKM_CERT_PASSWORD") ?? "pkmanager123";

// Program.cs — 连接字符串（已支持 appsettings.json，只需去掉绝对路径）
// appsettings.json → appsettings.Development.json / appsettings.Production.json
// 提交 appsettings.template.json 作为模板
```

```typescript
// vite.config.ts — 证书路径
const certDir = process.env.PKM_CERT_DIR || path.resolve(__dirname, '../server');
// ...
https: {
  key: path.join(certDir, 'cert.key'),
  cert: path.join(certDir, 'cert.crt'),
}
```

```csharp
// EmulatorController.cs — ROM 目录
var romDir = Environment.GetEnvironmentVariable("PKM_ROM_DIR") 
    ?? Path.Combine(AppContext.BaseDirectory, "../../../..", "roms");
```

#### 需改造的文件清单

| 文件 | 改造内容 |
|------|---------|
| `Program.cs` | PFX 证书路径 → 环境变量 + 相对路径 |
| `appsettings.json` | 连接字符串 → 环境变量 + 只在 Development.json 中保留 |
| `vite.config.ts` | 证书路径 → 环境变量 |
| `EmulatorController.cs` | ROM 目录硬编码 → 环境变量 + 相对路径 |
| `start-dev.sh` | 自动生成默认配置 |
| 新增: `.env.example` | 供开发者参考的环境变量模板 |

---

## 3. 🔴 严重耦合：数据库连接管理

### 3.1 当前状态

```
appsettings.json:
  ConnectionStrings:Default → "Host=/home/fmangela/pkmanager/data/pgdata/run;..."
```

- PostgreSQL Unix socket 路径硬编码
- 密码 `pkadmin123` 明文在配置文件中
- 无连接池配置、无重试策略

### 3.2 解耦方案

#### 数据库抽象层评估

当前使用 **Dapper + 原生 SQL**，已经比 Entity Framework 更灵活。问题不在 ORM，而在于：

1. **连接字符串管理** — 应该支持环境变量注入
2. **Provider 切换可能性** — SQLite 用于开发/轻量部署

**建议分两步**:

##### 第一步（立即执行）：连接字符串外部化

```csharp
// Program.cs
var connectionString = builder.Configuration.GetConnectionString("Default")
    ?? Environment.GetEnvironmentVariable("PKM_CONNECTION_STRING")
    ?? throw new InvalidOperationException("Database connection string not configured");
```

```json
// appsettings.template.json（提交到 git）
{
  "ConnectionStrings": {
    "Default": "Host=localhost;Port=5432;Database=pkmanager;Username=pkadmin;Password=YOUR_PASSWORD"
  }
}
```

##### 第二步（可选、远期）：支持 SQLite 轻量模式

SQLite 可以让开发者无需安装 PostgreSQL 即可体验项目：

```csharp
// DbConnectionFactory.cs
public class DbConnectionFactory
{
    private readonly string _connectionString;
    private readonly DatabaseProvider _provider;

    public DbConnectionFactory(IConfiguration config)
    {
        _provider = config.GetValue<DatabaseProvider>("Database:Provider", DatabaseProvider.PostgreSQL);
        _connectionString = _provider switch
        {
            DatabaseProvider.PostgreSQL => config.GetConnectionString("PostgreSQL")!,
            DatabaseProvider.SQLite => config.GetConnectionString("SQLite")!,
            _ => throw new NotSupportedException()
        };
    }

    public IDbConnection CreateConnection() => _provider switch
    {
        DatabaseProvider.PostgreSQL => new NpgsqlConnection(_connectionString),
        DatabaseProvider.SQLite => new SQLiteConnection(_connectionString),
        _ => throw new NotSupportedException()
    };
}
```

⚠️ **注意**: SQLite 模式需要审查所有 PostgreSQL 特有语法（`ON CONFLICT` → `INSERT OR REPLACE`、`GIN` 索引替代方案、`gen_random_uuid()` → `lower(hex(randomblob(4)))` 等）。建议作为后续迭代，当前优先做连接字符串外部化。

---

## 4. 🟡 中等耦合：本地化 (i18n)

### 4.1 当前状态

项目 100% 中文硬编码：
- 前端: 32 个文件含中文，最多的 `Saves.tsx` 有 166 处
- 后端: 20 个文件含中文，所有的 UI 消息、API 错误信息直接写中文

### 4.2 影响范围

| 层级 | 中文出现形式 | 示例 |
|------|-------------|------|
| 前端 UI | JSX 标签文本、placeholder、message | `<Button>同步存档</Button>` |
| 前端 API 错误 | axios 拦截器中的用户提示 | `"请求超时"`, `"网络连接失败"` |
| 后端 API 消息 | `ApiResponse.Message` | `"存档已同步"`, `"未登录"` |
| 后端校验错误 | Controller 中的 BadRequest | `"缺少存档数据"`, `"未配置 Azahar 路径"` |
| 游戏元数据 | `games.ts` 中的 displayName | `"宝可梦 红宝石"`, `"红宝石"` |

### 4.3 解耦方案

**推荐**: 三层分离策略

```
┌─────────────────────────────────────────────┐
│ Layer 1: 游戏数据永不翻译（物种名/招式/特性等）│
│   数据来源: PKHeX.Core 内置多语言资源            │
│   前端已通过 ResourceController 按需请求          │
├─────────────────────────────────────────────┤
│ Layer 2: UI 文案需要 i18n 框架                │
│   登录/注册/设置/按钮文本/提示消息/错误信息       │
│   使用 react-i18next / FormatJS / 自定义轻量方案  │
├─────────────────────────────────────────────┤
│ Layer 3: 后端 API 消息跟随前端 Accept-Language │
│   后端返回翻译后的消息，前端通过 i18n key 映射     │
└─────────────────────────────────────────────┘
```

**具体实施**:

##### 前端：创建 i18n 基础设施

```
client/src/i18n/
  ├── index.ts           # i18n 初始化
  ├── locales/
  │   ├── zh-CN.ts       # 简体中文（默认）
  │   ├── en-US.ts       # 英文
  │   └── ja-JP.ts       # 日文（未来）
  └── useTranslation.ts  # hook 封装
```

每个 locale 文件是扁平的 key-value：

```typescript
// zh-CN.ts
export default {
  'common.save': '保存',
  'common.cancel': '取消',
  'common.sync': '同步存档',
  'auth.login': '登录',
  'auth.register': '注册',
  'save.upload': '上传存档',
  'save.playWasm': 'WASM 游玩',
  'save.playLocal': '本机',
  'emu.launching': '正在启动模拟器...',
  'emu.synced': '存档已同步',
  'error.network': '网络连接失败',
  'error.timeout': '请求超时',
  'error.unauthorized': '未登录',
  // ... 约 200-300 个 key
};
```

##### 后端：API 消息支持语言参数

```csharp
// 方案 A: 简单方案 — 返回消息 key，前端翻译
return Ok(ApiResponse<object>.Ok(new { }, "save.synced"));

// 方案 B: 完整方案 — 后端根据 Accept-Language 返回对应语言消息
// （需要新建 MessageLocalizer 服务，工作量大，建议先用方案 A）
```

### 4.4 游戏名称的处理

`constants/games.ts` 中的 `displayName`、`shortName` 当前只有中文。游戏名称本身作为专有名词，选择：

- **保留中文 displayName 作为默认**
- **添加英文 locale fallback**: 在 i18n 中为 22 款游戏提供英文名映射
- **封面图片优先**: Dashboard 已经优先使用封面图，名称作为补充

---

## 5. 🟡 中等耦合：ROM 资源解耦

### 5.1 当前状态

- ROM 文件目录硬编码: `/home/fmangela/pkmanager/roms`
- `EmulatorController.ImportLocal()` 的 ROM 名称映射硬编码了中文文件名
- ROM 元数据通过 `rom_files` 表管理
- WASM 模拟器内核（`mgba.wasm`、wasmelonDS）已在 `client/public/emulator/` 下

### 5.2 解耦方案

```
项目结构:
  roms/                          ← 忽略（.gitignore 已配置）
  client/public/
    emulator/
      mgba.js / mgba.wasm       ← 已提交（社区可分发自构建）
      nds/
        wasmemulator.js / .wasm ← 同上
```

**需要做的**:

| 事项 | 说明 |
|------|------|
| `ImportLocal()` ROM 名称映射 | 从硬编码字典 → 外部 JSON 配置文件 `roms/rom-mapping.json` |
| ROM 目录 | 通过环境变量 `PKM_ROM_DIR` 或相对路径 `./roms/` 发现 |
| README 文档 | 添加 ROM 导入指南（不提供 ROM 下载链接，但说明格式和命名规范） |
| `rom-mapping.json` 模板 | 提供示例配置，开发者可自定义 |

```json
// roms/rom-mapping.json
{
  "mappings": [
    {"pattern": "ruby",            "gameId": "pkm_ruby",      "displayName": "Pokémon Ruby",     "generation": 3},
    {"pattern": "sapphire",        "gameId": "pkm_sapphire",  "displayName": "Pokémon Sapphire",  "generation": 3},
    // ... 22 款游戏
  ],
  "romDir": "./roms"
}
```

---

## 6. 🟡 中等耦合：配置管理分散

### 6.1 当前问题

| 配置项 | 当前存储位置 | 问题 |
|--------|-------------|------|
| JWT Secret | `appsettings.json` 明文 | 不应提交到 git |
| 数据库密码 | `appsettings.json` 明文 | 不应提交到 git |
| 证书密码 | `Program.cs` 硬编码 | 不应硬编码 |
| 模拟器路径 | `user_settings` 表（数据库） | 合理 — 按用户隔离 |
| 前端 API baseURL | `axios.ts` 硬编码 `/api` | 通过 Vite proxy，相对路径 OK |
| ROM 目录 | `EmulatorController.cs` 硬编码 | 需要外部化 |

### 6.2 解耦方案

```
层次化配置策略:
  1. appsettings.json          → 非敏感默认值（提交）
  2. appsettings.Development.json → 本地开发覆盖（gitignore）
  3. appsettings.template.json → 模板文件（提交，供参考）
  4. 环境变量 (PKM_* 前缀)    → 生产部署 + CI
  5. user_settings 表          → 用户偏好（模拟器路径等）
```

新增 `.env.example`:

```bash
# pkmanager 环境变量模板
# 复制此文件为 .env 并填入实际值

# 数据库
PKM_CONNECTION_STRING=Host=localhost;Port=5432;Database=pkmanager;Username=pkadmin;Password=YOUR_PASSWORD

# JWT（至少 64 字符）
PKM_JWT_SECRET=Your-Secret-At-Least-64-Characters-Long-For-HS256-Algorithm

# 证书（开发环境可选，不设置则仅 HTTP）
PKM_CERT_PATH=./server/cert.pfx
PKM_CERT_PASSWORD=your-cert-password

# ROM 目录
PKM_ROM_DIR=./roms

# 数据目录（存档、日志等）
PKM_DATA_DIR=./server/PkManager.Server/data
```

---

## 7. 🟢 低耦合：PostgreSQL 与 Dapper

### 7.1 当前状态

- 使用 Dapper 而非 EF Core，已经具有良好的 SQL 控制力
- `DbConnectionFactory` 封装了连接创建
- 所有 SQL 为原生 PostgreSQL 语法
- 使用了 PostgreSQL 特有特性：`ON CONFLICT DO UPDATE`、`GIN` 索引、`gen_random_uuid()`

### 7.2 评估

**推荐维持 PostgreSQL 作为主数据库**。理由：
- JSONB 查询用于银行宝可梦筛选（GIN 索引加速）
- 项目目标用户群体（模拟器玩家）通常有技术背景
- Dapper 已经提供了比 EF Core 更薄的抽象
- 切换 DB 的工作量远大于收益

**但对于开发者友好**，可以：
1. 提供 Docker Compose 一键启动 PostgreSQL（可选）
2. `init.sql` 完善注释（已完成）
3. 将来可选 SQLite 轻量模式（见 Section 3）

---

## 8. 🟢 不解耦的核心绑定（确认）

以下依赖保持不变，项目围绕它们构建：

| 核心 | 绑定方式 | 原因 |
|------|---------|------|
| PKHeX.Core | NuGet 包引用 | 存档解析/编辑引擎，22 款游戏支持，无可替代 |
| mGBA WASM | `@thenick775/mgba-wasm` npm 包 + 本地 `.wasm` | 浏览器内 GBA 模拟，唯一成熟方案 |
| melonDS WASM | 预编译产物 + `melonds.ts` 封装 | NDS 模拟，Emscripten 5.0.7 编译 |
| Azahar | 外部可执行文件，`pkmanager://` 协议调起 | 3DS 模拟，唯一的活跃 3DS 模拟器 |
| DeSmuME | 外部可执行文件，协议/脚本调起 | NDS 备选方案，GPLv2 开源成熟稳定 |

---

## 9. 实施优先级与预估

### Phase 1: 必须（让项目可被 clone 后运行）— 预估 2-3 小时

| # | 任务 | 涉及文件 | 预估 |
|---|------|---------|------|
| 1 | 连接字符串外部化（环境变量 + 相对路径） | `Program.cs`, `appsettings.json`, 新增 `.env.example` | 30min |
| 2 | 证书路径外部化 | `Program.cs`, `vite.config.ts` | 20min |
| 3 | ROM 目录硬编码修复 | `EmulatorController.cs` | 15min |
| 4 | `appsettings.template.json` + 移除 `appsettings.json` 中的敏感值 | 新建模板 | 15min |
| 5 | `.gitignore` 审查 — 确保敏感文件不提交 | `.gitignore` | 10min |
| 6 | `start-dev.sh` 更新 — 自动生成开发配置 | `start-dev.sh` | 30min |

### Phase 2: 推荐（提升协作体验）— 预估 4-6 小时

| # | 任务 | 涉及文件 | 预估 |
|---|------|---------|------|
| 7 | 前端 i18n 基础设施搭建 | 新建 `client/src/i18n/`, 全部 .tsx 文件 | 3h |
| 8 | 后端 API 消息统一管理 | 新建 `Messages.cs` 常量类 | 1h |
| 9 | ROM 映射配置外部化 | 新建 `roms/rom-mapping.json` | 30min |
| 10 | README.md 完善（快速开始、架构图、贡献指南） | `README.md` | 1h |

### Phase 3: 远期（生产级完善）

| # | 任务 | 说明 |
|---|------|------|
| 11 | SQLite 轻量模式（可选） | 开发者无需安装 PostgreSQL |
| 12 | Docker Compose 一键部署 | 包含 PostgreSQL + .NET + Vite |
| 13 | CI/CD (GitHub Actions) | 自动构建 + 测试 |

---

## 10. .gitignore 审查

当前 `.gitignore`:

```
✅ data/                          — 存档 + 日志 + pgdata（已忽略）
✅ sdk/                           — 外部 SDK 源码（已忽略）
✅ server/PkManager.Server/data/  — 重复但无害
⚠️ appsettings.Development.json   — 需确认已忽略（用于本地开发覆盖）
❌ roms/                          — 当前不在 gitignore，但目录在项目内！
❌ .env                           — 未忽略环境变量文件
❌ *.pfx                          — 证书文件未显式忽略
```

**需要添加的忽略规则**:

```gitignore
# 新增
.env
.env.local
*.pfx
server/cert.key
server/cert.crt
appsettings.Development.json
appsettings.*.local.json
roms/
```

---

## 11. 总结

```
┌──────────────────────────────────────────────────────┐
│                  项目解耦完成后的理想状态                │
│                                                      │
│  git clone https://github.com/.../pkmanager          │
│  cd pkmanager                                        │
│  cp .env.example .env          # 填数据库密码等       │
│  cp appsettings.template.json appsettings.json        │
│  # (对于 ROM 目录，修改 .env 中的 PKM_ROM_DIR)          │
│  # (将 ROM 文件放入 roms/ 目录)                         │
│  ./start-dev.sh               # 一键启动！             │
│                                                      │
│  浏览器打开 https://localhost:5173                     │
│  注册 → 上传存档 → 编辑 → 模拟器游玩                     │
└──────────────────────────────────────────────────────┘
```

**核心原则**: 不改架构、不改核心绑定（PKHeX/mGBA/melonDS/Azahar/DeSmuME），仅做配置外部化 + i18n 基础设施，让项目从「作者机器专属」变为「社区可参与」。

**不变的核心资产**: 这套 WASM 模拟器 + 本地模拟器 + PKHeX 编辑引擎的三合一架构，是目前开源社区中独一无二的宝可梦全世代管理方案。
