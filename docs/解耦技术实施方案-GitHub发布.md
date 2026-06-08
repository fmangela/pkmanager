# pkmanager GitHub 发布前 — 解耦技术实施方案

> **日期**: 2026-06-08
> **依赖**: `docs/解耦分析报告-GitHub发布准备.md`（先阅读该报告了解全局耦合情况）
> **目标**: 在不改动架构和核心绑定（PKHeX.Core / mGBA WASM / melonDS WASM / Azahar / DeSmuME）的前提下，将配置层、UI层、资源层解耦，使项目可被社区开发者 `git clone` 后直接运行。
> **下游状态**: `git clone` → `cp .env.example .env` → 编辑 `.env` → `./start-dev.sh` → 浏览器打开 `https://localhost:5173`

---

## 1. 硬编码绝对路径消除

### 1.1 问题清单

当前 4 处硬编码绝对路径阻止项目在其他机器上运行：

| 文件 | 硬编码内容 | 影响 |
|------|-----------|------|
| `client/vite.config.ts:10-11` | `/home/fmangela/pkmanager/server/cert.key` + `cert.crt` | 前端启动失败 |
| `server/.../Program.cs:18` | `/home/fmangela/pkmanager/server/cert.pfx` | HTTPS 监听失败 |
| `server/.../EmulatorController.cs:70` | `/home/fmangela/pkmanager/roms` | ROM 导入功能不可用 |
| `start-dev.sh:81` | `/usr/lib/postgresql/14/bin/pg_ctl` | 非 Ubuntu 22.04/PostgreSQL 14 环境启动失败 |

### 1.2 统一原则

所有路径遵循 **环境变量 (`PKM_*`) → 配置文件 → 相对项目根路径** 的优先级链。

### 1.3 vite.config.ts 改造

将硬编码证书路径改为环境变量 + 相对路径回退，同时支持无证书 HTTP 模式：

```typescript
import path from 'path';
import fs from 'fs';

const certDir = process.env.PKM_CERT_DIR || path.resolve(__dirname, '../server');
const useHttps = process.env.PKM_NO_HTTPS !== '1';
const certKey = path.join(certDir, 'cert.key');
const certCrt = path.join(certDir, 'cert.crt');

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: parseInt(process.env.PKM_DEV_PORT || '5173'),
    // HTTPS 仅在证书文件存在时启用；无证书时 fallback 到 HTTP
    ...(useHttps && fs.existsSync(certKey) && fs.existsSync(certCrt) ? {
      https: { key: fs.readFileSync(certKey), cert: fs.readFileSync(certCrt) },
    } : {}),
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
});
```

> ⚠️ **注意**: 无 HTTPS 模式时 SharedArrayBuffer 不可用，WASM 模拟器无法运行。这是浏览器安全策略限制，非本项目问题。开发环境可通过 `mkcert` 生成自签证书解决。

### 1.4 Program.cs 改造

```csharp
// ── 数据库连接（环境变量优先） ──
var connectionString = Environment.GetEnvironmentVariable("PKM_CONNECTION_STRING")
    ?? builder.Configuration.GetConnectionString("Default")
    ?? throw new InvalidOperationException(
        "数据库连接未配置。请设置 PKM_CONNECTION_STRING 环境变量或配置 appsettings.json");

// ── HTTPS 配置（仅在证书文件存在时启用） ──
var certPath = Environment.GetEnvironmentVariable("PKM_CERT_PATH")
    ?? Path.Combine(AppContext.BaseDirectory, "../../../..", "server/cert.pfx");
var certPassword = Environment.GetEnvironmentVariable("PKM_CERT_PASSWORD") ?? "pkmanager123";

builder.WebHost.ConfigureKestrel(options =>
{
    options.ListenAnyIP(5000); // HTTP — 始终监听
    if (File.Exists(certPath))
    {
        options.ListenAnyIP(5001, listenOptions =>
            listenOptions.UseHttps(certPath, certPassword));
    }
});
```

### 1.5 EmulatorController.cs ROM 目录改造

```csharp
/// <summary>获取 ROM 目录（环境变量 > 相对路径回退）</summary>
private static string GetRomDirectory()
{
    var env = Environment.GetEnvironmentVariable("PKM_ROM_DIR");
    if (!string.IsNullOrEmpty(env)) return env;
    // 相对项目根目录
    return Path.Combine(AppContext.BaseDirectory, "../../../..", "roms");
}

// ImportLocal() 中:
[HttpPost("roms/import-local")]
public async Task<ActionResult<ApiResponse<object>>> ImportLocal()
{
    var romDir = GetRomDirectory();
    if (!Directory.Exists(romDir))
        return BadRequest(ApiResponse<object>.Error(400, $"ROM目录不存在: {romDir}"));

    // 从 roms/rom-mapping.json 读取文件名→gameId 映射（见 5.2）
    var mappings = LoadRomMappings();
    // ... 遍历文件匹配
}
```

### 1.6 start-dev.sh PostgreSQL 路径自适应

```bash
# ── 自动检测 pg_ctl ──
PG_CTL=$(command -v pg_ctl 2>/dev/null)
if [ -z "$PG_CTL" ]; then
    for ver in 17 16 15 14 13; do
        if [ -f "/usr/lib/postgresql/$ver/bin/pg_ctl" ]; then
            PG_CTL="/usr/lib/postgresql/$ver/bin/pg_ctl"
            break
        fi
    done
fi
if [ -z "$PG_CTL" ]; then
    err "未找到 pg_ctl。请安装 PostgreSQL 或将 pg_ctl 加入 PATH。"
    exit 1
fi

# PostgreSQL 连接：优先 TCP localhost，兼容不同部署方式
PG_HOST="${PKM_PG_HOST:-localhost}"
PG_PORT="${PKM_PG_PORT:-5432}"

# 启动 PostgreSQL（使用检测到的 pg_ctl）
if pg_isready -h "$PG_HOST" -p "$PG_PORT" > /dev/null 2>&1; then
    log "   PostgreSQL 已在运行 ✅"
else
    log "   启动 PostgreSQL ($PG_CTL -D $PGDATA)..."
    "$PG_CTL" -D "$PGDATA" -l "$PG_LOG" start
fi
```

---

## 2. 配置体系重构

### 2.1 新增文件清单

| 文件 | 用途 | 提交到 git |
|------|------|-----------|
| `.env.example` | 环境变量模板（含详细注释） | ✅ |
| `appsettings.template.json` | 后端配置模板（供开发者复制） | ✅ |
| `roms/rom-mapping.json` | ROM 文件名 → gameId 映射表 | ✅ |
| `roms/.gitkeep` | 保持 roms/ 目录存在 | ✅ |
| `scripts/setup-db.sh` | 一键创建数据库 + 用户 + 初始化表 | ✅ |
| `.env` | 用户实际配置 | ❌ |
| `appsettings.Development.json` | 本地开发配置覆盖 | ❌ |

### 2.2 `.env.example`

```bash
# ═══════════════════════════════════════════════════════════════
#  pkmanager 开发环境配置
#  使用方法: cp .env.example .env → 编辑 .env 填入实际值
# ═══════════════════════════════════════════════════════════════

# ── 数据库连接（必填） ──────────────────────────────────────
# PostgreSQL 连接字符串。格式:
#   Host=<主机>;Port=<端口>;Database=<库名>;Username=<用户>;Password=<密码>
PKM_CONNECTION_STRING=Host=localhost;Port=5432;Database=pkmanager;Username=pkadmin;Password=YOUR_PASSWORD

# ── JWT 密钥（必填，至少 64 字符） ──────────────────────────
PKM_JWT_SECRET=PkManager-JWT-Secret-Key-2026-Must-Be-At-Least-64-Characters-Long-For-HS256!
PKM_JWT_ISSUER=PkManager
PKM_JWT_AUDIENCE=PkManager-Client

# ── TLS 证书（可选 — 开发环境可使用 mkcert 生成） ──────────
# 不配置证书时，前端仅 HTTP 模式运行（WASM 模拟器需要 HTTPS + SharedArrayBuffer）
# PKM_CERT_PATH=./server/cert.pfx
# PKM_CERT_PASSWORD=your-cert-password
# PKM_CERT_DIR=./server

# ── 路径（可选，默认相对项目根目录） ──────────────────────
# PKM_ROM_DIR=./roms
# PKM_DATA_DIR=./server/PkManager.Server/data

# ── 端口（可选） ──────────────────────────────────────────
# PKM_DEV_PORT=5173
# PKM_API_PORT=5000

# ── 禁用 HTTPS（开发环境，设为 1 禁用。注意：禁用后 WASM 模拟器不可用） ──
# PKM_NO_HTTPS=0
```

### 2.3 `appsettings.template.json`

```json
{
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Warning"
    }
  },
  "AllowedHosts": "*",
  "ConnectionStrings": {
    "Default": "Host=localhost;Port=5432;Database=pkmanager;Username=pkadmin;Password=YOUR_PASSWORD"
  },
  "Jwt": {
    "Secret": "CHANGE-ME-Minimum-64-Characters-Long-For-HS256-Algorithm-Security-Requirement!",
    "Issuer": "PkManager",
    "Audience": "PkManager-Client",
    "ExpireHours": 2,
    "RefreshExpireDays": 7
  }
}
```

### 2.4 `appsettings.json` 精简

当前 `appsettings.json` 含真实数据库密码和 JWT Secret。应改为仅保留空占位，实际值通过 `.env` 或 `appsettings.Development.json` 注入：

```json
{
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Warning"
    }
  },
  "AllowedHosts": "*",
  "ConnectionStrings": {
    "Default": ""
  },
  "Jwt": {
    "Secret": "",
    "Issuer": "PkManager",
    "Audience": "PkManager-Client",
    "ExpireHours": 2,
    "RefreshExpireDays": 7
  }
}
```

### 2.5 `start-dev.sh` 首次运行向导

```bash
#!/usr/bin/env bash
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ── 首次运行：引导用户配置环境变量 ──
if [ ! -f "$PROJECT_DIR/.env" ]; then
    echo ""
    echo "╔══════════════════════════════════════════════════════╗"
    echo "║  🐾  首次运行 — 需要配置环境变量                      ║"
    echo "╠══════════════════════════════════════════════════════╣"
    echo "║                                                     ║"
    echo "║  📝 已从 .env.example 创建 .env 文件                  ║"
    echo "║  ✏️  请编辑 $PROJECT_DIR/.env                        ║"
    echo "║     至少需要配置 PKM_CONNECTION_STRING                ║"
    echo "║                                                     ║"
    echo "║  配置完成后重新运行: ./start-dev.sh                   ║"
    echo "╚══════════════════════════════════════════════════════╝"
    echo ""
    cp "$PROJECT_DIR/.env.example" "$PROJECT_DIR/.env"
    exit 0
fi

# 加载环境变量
set -a; source "$PROJECT_DIR/.env"; set +a
# ... 后续启动逻辑
```

### 2.6 `.gitignore` 追加

在现有 `.gitignore` 末尾追加：

```gitignore
# ── GitHub 发布解耦 — 敏感/本地文件 ──
.env
.env.local
*.pfx
server/cert.key
server/cert.crt
server/cert.pfx
appsettings.Development.json
appsettings.*.local.json

# ROM 目录（ROM 文件不提交，映射配置文件提交）
roms/*
!roms/rom-mapping.json
!roms/.gitkeep
```

---

## 3. 数据库连接管理

### 3.1 现状分析

- `DbConnectionFactory` 已提供连接创建抽象层（注入 `NpgsqlConnection`）
- Dapper 已使用原生 SQL（非 EF Core），DB 切换门槛最低
- 问题仅在于连接字符串来源硬编码

### 3.2 改造方案

**仅外部化连接字符串来源，不改 `DbConnectionFactory` 结构：**

```csharp
// Program.cs
var connectionString = Environment.GetEnvironmentVariable("PKM_CONNECTION_STRING")
    ?? builder.Configuration.GetConnectionString("Default")
    ?? throw new InvalidOperationException(
        "数据库连接未配置。请设置 PKM_CONNECTION_STRING 环境变量或配置 appsettings.json。\n" +
        "参考 .env.example 文件获取配置模板。");

builder.Services.AddSingleton(new DbConnectionFactory(connectionString));
```

### 3.3 不引入 SQLite

SQLite 轻量模式作为远期规划，不在本次方案中实施。原因：
- PostgreSQL JSONB GIN 索引对银行宝可梦筛选至关重要
- `ON CONFLICT DO UPDATE`、`ILIKE`、`gen_random_uuid()` 等 PostgreSQL 特性需逐一适配
- 维护双 DB provider 的成本高于收益
- PostgreSQL 可通过包管理器一键安装

### 3.4 数据库初始化辅助脚本

新增 `scripts/setup-db.sh`：

```bash
#!/usr/bin/env bash
# 一键创建 pkmanager 数据库和用户
set -e

DB_USER="${1:-pkadmin}"
DB_PASS="${2:-pkadmin123}"
DB_NAME="${3:-pkmanager}"

echo "正在创建 PostgreSQL 用户和数据库..."
sudo -u postgres psql <<SQL
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '$DB_USER') THEN
        CREATE ROLE $DB_USER WITH LOGIN PASSWORD '$DB_PASS' CREATEDB;
    END IF;
END
\$\$;
CREATE DATABASE $DB_NAME OWNER $DB_USER;
SQL

echo "正在初始化表结构..."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
psql -h localhost -U "$DB_USER" -d "$DB_NAME" \
    -f "$SCRIPT_DIR/../server/PkManager.Server/Data/init.sql"

echo "✅ 数据库初始化完成。"
echo "   连接字符串: Host=localhost;Port=5432;Database=$DB_NAME;Username=$DB_USER;Password=$DB_PASS"
```

---

## 4. 前端 i18n 国际化方案

### 4.1 架构选择

采用**轻量自定义方案**（零外部依赖），利用 React Context 实现。不引入 `react-i18next` 等第三方库，原因：
- 项目翻译规模约 270 个 key，不需要工业级 i18n 框架的复杂性
- 减少 npm 依赖，降低供应链风险
- 完全可控的类型安全（TypeScript key 枚举）

### 4.2 目录结构

```
client/src/i18n/
├── index.tsx              # I18nProvider 组件 + useI18n() hook + createT() 工厂
├── locales/
│   ├── zh-CN.ts           # 简体中文（默认，从当前代码提取）
│   └── en-US.ts           # 英文翻译
└── keys.ts                # I18nKeys 类型定义（所有合法 key 的 union type）
```

### 4.3 核心实现

```typescript
// ── client/src/i18n/index.tsx ──

import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { zhCN } from './locales/zh-CN';
import { enUS } from './locales/en-US';

export type SupportedLocale = 'zh-CN' | 'en-US';

const MESSAGES: Record<SupportedLocale, Record<string, string>> = {
  'zh-CN': zhCN,
  'en-US': enUS,
};

interface I18nContextValue {
  locale: SupportedLocale;
  setLocale: (l: SupportedLocale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

/** Provider — 包裹整个 App */
export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<SupportedLocale>(() => {
    // 从 localStorage 恢复语言偏好
    const stored = localStorage.getItem('pkmanager_locale');
    return (stored === 'en-US' ? 'en-US' : 'zh-CN');
  });

  const t = useCallback((key: string, params?: Record<string, string | number>) => {
    const messages = MESSAGES[locale];
    let msg = messages[key] ?? key; // 未翻译的 key 原样显示（方便发现遗漏）
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        msg = msg.replace(`{${k}}`, String(v));
      }
    }
    return msg;
  }, [locale]);

  const handleSetLocale = useCallback((l: SupportedLocale) => {
    localStorage.setItem('pkmanager_locale', l);
    setLocale(l);
  }, []);

  const value = useMemo(() => ({ locale, setLocale: handleSetLocale, t }), [locale, handleSetLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Hook — 在组件中使用翻译 */
export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
```

### 4.4 Key 组织结构

按页面/组件域名空间分组，flat key（方便 grep 和去重）：

```typescript
// ── client/src/i18n/keys.ts ──

/** 所有合法的 i18n key。编译时类型检查，防止拼写错误。 */
export type I18nKey =
  // ── 通用操作 ──
  | 'common.save' | 'common.cancel' | 'common.confirm' | 'common.delete'
  | 'common.sync' | 'common.back' | 'common.close' | 'common.copy'
  | 'common.refresh' | 'common.loading' | 'common.search' | 'common.export'
  | 'common.import' | 'common.edit' | 'common.create' | 'common.upload'
  | 'common.download' | 'common.settings' | 'common.yes' | 'common.no'

  // ── 认证 ──
  | 'auth.login' | 'auth.register' | 'auth.logout'
  | 'auth.username' | 'auth.password' | 'auth.confirmPassword' | 'auth.email'
  | 'auth.loginSuccess' | 'auth.registerSuccess' | 'auth.loginPrompt'
  | 'auth.tokenExpired' | 'auth.noAccount' | 'auth.hasAccount'

  // ── 存档管理 ──
  | 'save.title' | 'save.upload' | 'save.download' | 'save.delete'
  | 'save.edit' | 'save.playWasm' | 'save.playLocal' | 'save.sync'
  | 'save.backups' | 'save.newGame' | 'save.legalityScan'
  | 'save.allBoxes' | 'save.boxName' | 'save.trainerName'
  | 'save.playTime' | 'save.pokemonCount'
  | 'save.uploadSuccess' | 'save.synced' | 'save.deleted' | 'save.restored'

  // ── 模拟器 ──
  | 'emu.launching' | 'emu.configureFirst' | 'emu.notConfigured'
  | 'emu.synced' | 'emu.saveNotExist' | 'emu.syncFailed'
  | 'emu.pause' | 'emu.resume' | 'emu.reset' | 'emu.volume'
  | 'emu.speed' | 'emu.scale' | 'emu.fps' | 'emu.keybinds'

  // ── 编辑面板 Tab ──
  | 'editor.main' | 'editor.stats' | 'editor.moves' | 'editor.met'
  | 'editor.legality' | 'editor.otmisc' | 'editor.cosmetic'
  | 'editor.species' | 'editor.nickname' | 'editor.level' | 'editor.exp'
  | 'editor.nature' | 'editor.ability' | 'editor.item' | 'editor.ball'
  | 'editor.legal' | 'editor.fishy' | 'editor.illegal'
  | 'editor.shiny' | 'editor.gender' | 'editor.form'

  // ── 设置 ──
  | 'settings.title' | 'settings.azaharPath' | 'settings.desmumePath'
  | 'settings.dataDir' | 'settings.saveDir' | 'settings.autoDetect'
  | 'settings.testLaunch' | 'settings.saved'

  // ── 诊断 ──
  | 'diag.title' | 'diag.errors' | 'diag.warnings' | 'diag.info'
  | 'diag.exportAll' | 'diag.clearAll' | 'diag.healthCheck'
  | 'diag.openPanel' | 'diag.noErrors'

  // ── 错误消息 ──
  | 'error.network' | 'error.timeout' | 'error.unauthorized'
  | 'error.notFound' | 'error.serverError' | 'error.unknown'
  | 'error.validation' | 'error.fileTooLarge';
```

### 4.5 语言文件示例

```typescript
// ── client/src/i18n/locales/zh-CN.ts ──
export const zhCN: Record<string, string> = {
  'common.save': '保存',
  'common.cancel': '取消',
  'common.confirm': '确认',
  'common.delete': '删除',
  'common.sync': '同步存档',
  'common.back': '返回',
  // ... 约 270 个 key，从现有代码中提取
};

// ── client/src/i18n/locales/en-US.ts ──
export const enUS: Record<string, string> = {
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.confirm': 'Confirm',
  'common.delete': 'Delete',
  'common.sync': 'Sync Save',
  'common.back': 'Back',
  // ...
};
```

### 4.6 在 App.tsx 中集成

```typescript
// App.tsx
import { I18nProvider } from './i18n';

function App() {
  return (
    <I18nProvider>
      <ConfigProvider locale={/* 根据 locale 选择 antd 语言包 */}>
        <Router>...</Router>
      </ConfigProvider>
    </I18nProvider>
  );
}
```

### 4.7 在组件中使用

```typescript
// 替换前:
<Button>同步存档</Button>
<message.success('存档已同步');

// 替换后:
import { useI18n } from '../../i18n';
const { t } = useI18n();
<Button>{t('common.sync')}</Button>
message.success(t('save.synced'));
```

### 4.8 游戏元数据多语言

`constants/games.ts` 当前仅含中文游戏名。新增英文翻译字段：

```typescript
export interface GameMeta {
  gameId: string;
  displayName: string;       // 中文名称（默认）
  displayNameEn: string;     // 英文名称
  shortName: string;         // 中文简称
  shortNameEn: string;       // 英文简称
  color: string;
  gameVersion: number;
  generation: number;
  platform: GamePlatform;
}

// GameCover 组件中:
const name = locale === 'en-US' ? meta.displayNameEn : meta.displayName;
```

### 4.9 后端 API 消息策略

后端 **不**实现完整的 i18n（工作量大且前后端翻译分裂风险高）。采取以下折中：

1. 后端 ApiResponse 的 `message` 字段保持中文（不变），**不在前端 UI 中直接展示**
2. 前端 UI 文案全部通过 `useI18n().t()` 渲染，与后端 message 解耦
3. 后端新建 `Helpers/Messages.cs` 集中管理消息常量，方便未来扩展:

```csharp
namespace PkManager.Server.Helpers;

/// <summary>API 响应消息常量（中文默认）。未来国际化时从此处统一替换。</summary>
public static class Messages
{
    public const string Unauthorized = "未登录";
    public const string InvalidRequest = "请求参数不合法";
    public const string LoginSuccess = "登录成功";
    public const string RegisterSuccess = "注册成功";
    public const string SaveSynced = "存档已同步";
    public const string SaveUploaded = "存档上传并解析成功";
    public const string SaveDeleted = "存档已删除";
    public const string SaveSaved = "存档已保存并备份";
    public const string BackupRestored = "已从备份恢复";
    public const string MovedToSave = "已移入存档";
    public const string RomUploaded = "ROM上传成功";
    public const string SavestateSaved = "即时存档 #{0} 已保存";
    public const string TokenExpired = "同步 token 已过期";
    public const string TokenMismatch = "同步 token 不匹配";
}
```

### 4.10 实施范围与分阶段计划

| 阶段 | 覆盖范围 | 预估 key 数 | 涉及文件数 |
|------|---------|------------|-----------|
| 1 | Login, Register, Dashboard | ~40 | 3 |
| 2 | Saves, SaveEditor, EditPanel 壳 | ~60 | 3 |
| 3 | 7 个编辑 Tab 组件 | ~80 | 7 |
| 4 | Emulator, NdsEmulator, Settings | ~50 | 3 |
| 5 | Bank, DiagnosticPanel, 其余页面 | ~40 | 3 |
| 6 | `constants/games.ts` 多语言字段 | N/A | 1 |
| 7 | 后端 `Messages.cs` 重构 | N/A | 9 Controllers |
| **合计** | | **~270** | **29** |

---

## 5. ROM 资源解耦

### 5.1 改造要点

1. ROM 目录通过 `PKM_ROM_DIR` 环境变量或相对路径 `./roms/` 定位（见 1.5）
2. `ImportLocal()` 的文件名匹配规则从硬编码字典 → 外部 `roms/rom-mapping.json`
3. `roms/` 目录加入 `.gitignore`，ROM 文件不提交
4. `roms/rom-mapping.json` 提交到 git，开发者可按需修改

### 5.2 `roms/rom-mapping.json` 规范

```json
{
  "$schema": "无",
  "description": "ROM 文件名 → gameId 映射表。ImportLocal 端点根据此文件自动识别 ROM。pattern 为大小写不敏感子串匹配。",
  "mappings": [
    {
      "pattern": "ruby",
      "gameId": "pkm_ruby",
      "displayName": "Pokémon Ruby",
      "generation": 3,
      "extensions": [".gba"]
    },
    {
      "pattern": "sapphire",
      "gameId": "pkm_sapphire",
      "displayName": "Pokémon Sapphire",
      "generation": 3,
      "extensions": [".gba"]
    },
    {
      "pattern": "emerald",
      "gameId": "pkm_emerald",
      "displayName": "Pokémon Emerald",
      "generation": 3,
      "extensions": [".gba"]
    },
    {
      "pattern": "firered",
      "gameId": "pkm_firered",
      "displayName": "Pokémon FireRed",
      "generation": 3,
      "extensions": [".gba"]
    },
    {
      "pattern": "leafgreen",
      "gameId": "pkm_leafgreen",
      "displayName": "Pokémon LeafGreen",
      "generation": 3,
      "extensions": [".gba"]
    },
    {
      "pattern": "diamond",
      "gameId": "pkm_diamond",
      "displayName": "Pokémon Diamond",
      "generation": 4,
      "extensions": [".nds"]
    },
    {
      "pattern": "pearl",
      "gameId": "pkm_pearl",
      "displayName": "Pokémon Pearl",
      "generation": 4,
      "extensions": [".nds"]
    },
    {
      "pattern": "platinum",
      "gameId": "pkm_platinum",
      "displayName": "Pokémon Platinum",
      "generation": 4,
      "extensions": [".nds"]
    },
    {
      "pattern": "heartgold",
      "gameId": "pkm_heartgold",
      "displayName": "Pokémon HeartGold",
      "generation": 4,
      "extensions": [".nds"]
    },
    {
      "pattern": "soulsilver",
      "gameId": "pkm_soulsilver",
      "displayName": "Pokémon SoulSilver",
      "generation": 4,
      "extensions": [".nds"]
    },
    {
      "pattern": "black2",
      "gameId": "pkm_black2",
      "displayName": "Pokémon Black 2",
      "generation": 5,
      "extensions": [".nds"]
    },
    {
      "pattern": "white2",
      "gameId": "pkm_white2",
      "displayName": "Pokémon White 2",
      "generation": 5,
      "extensions": [".nds"]
    },
    {
      "pattern": "black",
      "gameId": "pkm_black",
      "displayName": "Pokémon Black",
      "generation": 5,
      "extensions": [".nds"]
    },
    {
      "pattern": "white",
      "gameId": "pkm_white",
      "displayName": "Pokémon White",
      "generation": 5,
      "extensions": [".nds"]
    }
  ]
}
```

> 3DS ROM（`.3ds`/`.cci`/`.cxi`）不走 ImportLocal 自动匹配，因为 3DS 游戏使用 Azahar 的 CIA 安装机制，ROM 路径通过 settings 页的手动路径配置。

### 5.3 C# 端读取映射

```csharp
// EmulatorController.cs
private static List<RomMapping>? _cachedMappings;
private static readonly object _mappingLock = new();

private static List<RomMapping> LoadRomMappings()
{
    if (_cachedMappings != null) return _cachedMappings;
    lock (_mappingLock)
    {
        if (_cachedMappings != null) return _cachedMappings;
        var romDir = GetRomDirectory();
        var mappingPath = Path.Combine(romDir, "rom-mapping.json");
        if (!File.Exists(mappingPath))
        {
            _cachedMappings = new();
            return _cachedMappings;
        }
        var json = File.ReadAllText(mappingPath);
        var doc = JsonDocument.Parse(json);
        _cachedMappings = doc.RootElement.GetProperty("mappings")
            .EnumerateArray()
            .Select(e => new RomMapping
            {
                Pattern = e.GetProperty("pattern").GetString()!,
                GameId = e.GetProperty("gameId").GetString()!,
                DisplayName = e.GetProperty("displayName").GetString()!,
                Generation = e.GetProperty("generation").GetInt32(),
                Extensions = e.GetProperty("extensions").EnumerateArray()
                    .Select(x => x.GetString()!).ToList(),
            }).ToList();
        return _cachedMappings;
    }
}

private record RomMapping
{
    public string Pattern { get; init; } = "";
    public string GameId { get; init; } = "";
    public string DisplayName { get; init; } = "";
    public int Generation { get; init; }
    public List<string> Extensions { get; init; } = new();
}
```

---

## 6. 本地模拟器启动器适配

### 6.1 问题

`client/src/lib/localLaunch.ts:358` 中 Vite dev 检测硬编码端口：

```typescript
const isViteDev = window.location.port === '5173';
const backendBase = isViteDev
  ? `http://${window.location.hostname}:5000`
  : window.location.origin;
```

### 6.2 改造

使用 Vite 内置的 `import.meta.env.DEV` 和环境变量：

```typescript
const isDev = import.meta.env.DEV;
const backendBase = isDev
  ? (import.meta.env.VITE_API_BASE || `http://${window.location.hostname}:5000`)
  : window.location.origin;
```

同时在 `vite.config.ts` 的 `define` 中注入（或使用 Vite 的 `.env` 文件）：

```typescript
// vite.config.ts 新增
export default defineConfig({
  define: {
    __API_BASE__: JSON.stringify(process.env.VITE_API_BASE || `http://localhost:5000`),
  },
  // ...
});
```

---

## 7. 实施步骤总览

### Phase 1: 路径外部化（目标：clone 后可运行）— 预估 2.5h

| # | 任务 | 文件 | 类型 |
|---|------|------|------|
| K.1.1 | `.env.example` 模板 | 新建 | 配置 |
| K.1.2 | `appsettings.template.json` + `appsettings.json` 精简 | 新建 + 修改 | 配置 |
| K.1.3 | `Program.cs` 证书路径 + 连接字符串外部化 | 修改 | 后端 |
| K.1.4 | `vite.config.ts` 证书路径环境变量化 | 修改 | 前端 |
| K.1.5 | `EmulatorController.cs` ROM 目录 + 映射外部化 | 修改 | 后端 |
| K.1.6 | `.gitignore` 审计更新 | 修改 | 配置 |
| K.1.7 | `start-dev.sh` pg_ctl 自适应 + 首次运行向导 | 修改 | 脚本 |
| K.1.8 | `roms/rom-mapping.json` + `.gitkeep` | 新建 | 配置 |
| K.1.9 | `localLaunch.ts` Vite dev 检测健壮化 | 修改 | 前端 |

### Phase 2: i18n 基础设施 — 预估 6.5h

| # | 任务 | 类型 |
|---|------|------|
| K.2.1 | `client/src/i18n/index.tsx` + `keys.ts` 框架 | 新建 |
| K.2.2 | `App.tsx` 集成 `I18nProvider` | 修改 |
| K.2.3 | `zh-CN.ts` 翻译文件（从现有代码提取所有中文字符串）| 新建 |
| K.2.4 | 登录/注册页 i18n 替换 | 修改 |
| K.2.5 | Dashboard + Saves + Bank i18n 替换 | 修改 |
| K.2.6 | 编辑面板 7 Tab i18n 替换 | 修改 |
| K.2.7 | 模拟器/设置/诊断 i18n 替换 | 修改 |
| K.2.8 | `constants/games.ts` 英文游戏名字段 | 修改 |
| K.2.9 | 后端 `Helpers/Messages.cs` 消息常量集中 | 新建 + 修改 |
| K.2.10 | `en-US.ts` 翻译文件 | 新建 |

### Phase 3: 文档完善 — 预估 1.5h

| # | 任务 | 类型 |
|---|------|------|
| K.3.1 | `README.md` 重写（简介/快速开始/架构/贡献指南） | 修改 |
| K.3.2 | `scripts/setup-db.sh` 数据库初始化脚本 | 新建 |

---

## 8. 验证方案

### 8.1 模拟全新 clone 场景

```bash
cd /tmp
git clone <repo-url> pkmanager-test
cd pkmanager-test
cp .env.example .env
# 编辑 .env — 填入本地 PostgreSQL 连接信息
./start-dev.sh
# 预期: PostgreSQL 启动 → .NET 后端启动 → Vite 前端启动
curl http://localhost:5000/api/health  # → {"code":0,...}
curl http://localhost:5173              # → 200 HTML
```

### 8.2 构建零错误

```bash
cd client && npm run build              # TypeScript 0 errors + Vite production build
cd server/PkManager.Server && dotnet build  # .NET 0 errors (仅 1 个预存 CS1998 warning 除外)
```

### 8.3 i18n 完整性验证

- 默认 locale = `zh-CN`：所有 UI 文案与当前一致（无退化）
- 切换到 `en-US`：UI 切换为英文，未翻译 key 显示 key 本身（易发现遗漏）
- `GameCover` 组件随 locale 显示对应语言的游戏名称

---

## 9. 不变范围（明确排除）

以下核心绑定 **不在** 本次解耦范围内，保持现状：

| 核心 | 理由 |
|------|------|
| **PKHeX.Core** | NuGet 包，存档解析/编辑的唯一引擎，22 款游戏支持 |
| **mGBA WASM** | `@thenick775/mgba-wasm` + `client/public/emulator/mgba.wasm`，浏览器 GBA 模拟唯一方案 |
| **melonDS WASM** | Emscripten 编译产物，NDS 模拟核心 |
| **Azahar 外部可执行文件** | 3DS 模拟的唯一活跃开源方案 |
| **DeSmuME 外部可执行文件** | NDS 备选方案，GPLv2 成熟稳定 |
| **PostgreSQL** | 维持主数据库，不引入 SQLite（JSONB GIN 索引是银行查询的关键性能依赖） |
| **React 19 + ASP.NET Core 8 + Dapper + Zustand** | 项目架构，不做变更 |
| **存档文件系统路径** | `server/PkManager.Server/data/saves/` — 已在项目内部，使用 `IWebHostEnvironment.ContentRootPath` 相对定位 |
