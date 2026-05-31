# PKMDS-Blazor 可借鉴分析报告

> **分析日期**: 2026-05-30  
> **分析对象**: [PKMDS-Blazor](https://github.com/codemonkey85/PKMDS-Blazor) (pkmds.app)  
> **对比基准**: pkmanager (宝可梦全世代管理端)

---

## 目录

1. [两个项目当前状态对比](#一两个项目当前状态对比)
2. [高优先级借鉴项](#二高优先级借鉴项)
3. [中等优先级借鉴项](#三中等优先级借鉴项)
4. [低优先级锦上添花项](#四低优先级锦上添花项)
5. [架构层面可借鉴的模式](#五架构层面可借鉴的模式)
6. [pkmanager 的独特优势](#六pkmanager-的独特优势)
7. [总结建议](#七总结建议)

---

## 一、两个项目当前状态对比

### 项目定位

| 维度 | PKMDS-Blazor | pkmanager |
|------|-------------|-----------|
| **架构** | 纯客户端 Blazor WebAssembly | B/S 全栈：React + ASP.NET Core + PostgreSQL |
| **用户系统** | 无 | 多用户 + JWT 鉴权 |
| **宝可梦银行** | 客户端 IndexedDB | 服务端 PostgreSQL 持久化 |
| **离线能力** | ✅ 首次加载后可离线 | ❌ 依赖服务器 |
| **跨设备同步** | ❌ | ✅ 天然支持 |
| **核心引擎** | PKHeX.Core | PKHeX.Core |
| **部署** | 静态文件托管 | 服务器 + 数据库 |

### pkmanager 已有的功能

| 功能 | 状态 |
|------|------|
| 存档上传/解析/存储 | ✅ |
| 箱子网格展示 (6列) | ✅ |
| dnd-kit 拖拽（存档↔银行、存档内部） | ✅ |
| 随行宝可梦展示 | ✅ |
| 银行面板（服务端存储） | ✅ |
| 基础编辑面板（物种/昵称/性别/等级/闪光/IV/EV/招式/OT/相遇） | ✅ |
| 合法性校验（合法/不合法 二元判断） | ✅ |
| 用户登录/注册 JWT | ✅ |
| 存档管理列表 | ✅ |

---

## 二、高优先级借鉴项

直接提升产品竞争力的核心功能。

---

### 2.1 三态合法性体系 + 逐字段合法性指示器

**PKMDS-Blazor 做法：**

- `LegalityUi.cs` — 集中化的三态逻辑：

```csharp
public enum LegalityStatus { Legal, Fishy, Illegal }

public static LegalityStatus GetStatus(LegalityAnalysis la)
{
    var hasInvalid = la.Results.Any(r => r.Judgement == Severity.Invalid)
                     || !MoveResult.AllValid(la.Info.Moves)
                     || !MoveResult.AllValid(la.Info.Relearn);
    if (hasInvalid) return LegalityStatus.Illegal;
    var hasFishy = la.Results.Any(r => r.Judgement == Severity.Fishy);
    return hasFishy ? LegalityStatus.Fishy : LegalityStatus.Legal;
}
```

- **每个宝可梦格子**上叠加合法性状态图标（`PokemonSlotComponent.razor`）：
  - Legal → 绿色 ✓ | Fishy → 黄色 ⚠ | Illegal → 红色 ✗
- **LegalityReportTab** — 全存档批量扫描：Party + 全部 Box 运行 `LegalityAnalysis`，生成可排序/筛选的表格，含 Legal/Fishy/Illegal 汇总计数 Chip、状态过滤器 ToggleGroup
- **逐字段合法性指示器**（Issue [#411](https://github.com/codemonkey85/PKMDS-Blazor/issues/411)）：
  - 招式 Tab → 不合法招式旁显示警告图标
  - 能力值 Tab → IV/EV 字段旁指示器
  - 基本信息 Tab → 特性/性别/闪光/性格/形态/持有物
  - 相遇 Tab → 球种/地点/等级/来源版本
  - 缎带 Tab → 每枚缎带的合法性
- **LegalityPopover 组件**：点击不合法字段弹出 Popover，显示详情 + 「Fix Ball」「Fix Moves」等一键修复按钮
- **Legalize All 操作**：工具栏中一键修复当前箱子所有不合法宝可梦，带进度条 + 取消按钮

**🔧 对 pkmanager 的建议：**

> 将后端现有的 binary `isValid` 升级为三态（Legal/Fishy/Illegal），区分 `Severity.Invalid` 和 `Severity.Fishy`。
> 前端在每个格子精灵上叠加小圆点图标，在编辑面板各字段旁加内联指示器。
> 新增 `/api/legality/report` 批量扫描端点，返回所有槽位的合法性状态。

---

### 2.2 「全部箱子」弹窗 + 箱子 Swap

**PKMDS-Blazor 做法**（`BoxListDialog.razor`）：

```
┌────────────────────────────────────────────────┐
│  All Boxes                                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ Box 1: PC │ │ Box 2: 对战│ │ Box 3: 培育│      │
│  │ 6x5 grid  │ │ 6x5 grid  │ │ 6x5 grid  │      │
│  │         ⇄ │ │         ⇄ │ │         ⇄ │      │
│  └──────────┘ └──────────┘ └──────────┘       │
└────────────────────────────────────────────────┘
```

- 响应式布局：大屏 4 列、中屏 3 列、小屏 2 列、手机 1 列
- 每个箱子独立 ⇄ Swap 按钮（与相邻箱子交换）
- 单箱弹出模式（`BoxViewerDialog`）：独立前后翻页导航，手机全屏适配
- Pin Box 功能：将某个箱子固定在右侧面板

**🔧 对 pkmanager 的建议：**

> 存档编辑器顶部工具栏添加「全部箱子」按钮，弹出 Drawer/Modal 展示所有箱子网格。
> 这对管理大量箱子（Gen7 最多 32 个）极其重要，是 pkmanager 当前最大交互短板。

---

### 2.3 高级搜索 + 本地筛选器保存

**PKMDS-Blazor 做法**（`AdvancedSearchTab.razor`）：

- 多维度筛选：物种、闪光、性格、特性、持有道具、球种、来源版本、性别、等级范围、IV/EV 下限、招式（Any/All 匹配）、Hidden Power 类型、OT 名称/TID、语言、缎带/标记、合法状态
- localStorage 保存/加载筛选器（命名保存，下拉加载）
- 搜索结果批量导出为 Showdown 文本
- ExpansionPanel 折叠分组（Basic / Filters / Advanced）

**🔧 对 pkmanager 的建议：**

> pkmanager 的 PostgreSQL 在这方面有天然优势——可以用 SQL + JSONB 索引做高效查询。
> 在银行页面和存档编辑器内添加高级搜索面板，后端用 GIN 索引加速 JSONB 字段检索。
> 用户保存的筛选器存于数据库，跨设备同步。

---

### 2.4 Encounter Database（遭遇数据库）+ 生成合法宝可梦

**PKMDS-Blazor 做法**（`EncounterDatabaseTab.razor`）：

- 调用 PKHeX.Core 的 `EncounterMovesetGenerator` 浏览所有合法遭遇
- 筛选：物种（必选）、游戏版本、等级范围、闪光锁定、遭遇类型（Wild/Static/Mystery Gift/Trade/Egg）
- 结果表格含类型彩色标签和地点显示
- 详情面板 + 「Generate Legal Pokémon」按钮直接在选定格子生成

**🔧 对 pkmanager 的建议：**

> 后端已有 PKHeX.Core，新增一个 API endpoint 调用 `EncounterMovesetGenerator`。
> 这是差异化功能——PKMDS-Blazor 纯客户端受限于 WASM 性能，pkmanager 服务端可以做更复杂的生成和缓存。

---

### 2.5 Batch Editor（批量编辑器）

**PKMDS-Blazor 做法**（`BatchEditorTab.razor`）：

- 多行脚本语法：
  - `=Species=25` — 筛选（Filter），匹配皮卡丘
  - `.Nickname=Pika` — 修改（Mutation），设置昵称
- 支持比较运算符（`>=`, `<=`, `>`, `<`, `=`, `!=`）
- Preset 预设系统（localStorage 持久化）
- Dry-run 预览模式：先看匹配结果和拟变更，再确认执行
- 范围选择器：Party / 当前箱子 / 所有箱子 / 全部
- 底层包装 PKHeX.Core 的 `BatchEditing` 引擎

**🔧 对 pkmanager 的建议：**

> 服务端架构让批量编辑更强——可直接运行 PKHeX.Core 批量处理，无需浏览器性能限制。
> 后端实现批量编辑 API，前端提供脚本编辑器 + 预览模式 + 预设管理。

---

## 三、中等优先级借鉴项

---

### 3.1 一键进化（One-Touch Evolve）

- 基本信息 Tab 上的 Evolve 按钮
- 单路径进化直接执行，分支进化弹出选择器（精灵图 + localized 名称 + 进化方式标签）
- Nincada → Ninjask（同时生成 Shedinja 到空位）
- 进化后自动同步昵称
- Gen2 交换进化显示所需持有道具

### 3.2 形态/外观可视化编辑器

专用 Dialog 组件，精灵图可视化选择：

| 宝可梦 | 编辑项 |
|--------|--------|
| Alcremie | 奶油造型（9种）+ 糖饰（7种）+ 旋转方向 |
| Vivillon | 18种花纹 |
| Furfrou | 10种修剪造型 |
| Minior | 7种核心颜色 |
| Pumpkaboo | 4种尺寸 |
| Florges | 5种花朵颜色 |

### 3.3 Info Popover 信息气泡

- `InfoButton.razor`：每个字段旁放 `ⓘ` 图标按钮
- 点击弹出 Popover（非 Modal），含标题 + 描述正文 + 关闭按钮
- `LegalityPopover.razor` 变体：彩色状态指示器 + 合法性详情 + Quick-Fix 按钮
- 用于招式描述、道具效果、特性说明、球种信息等上下文帮助
- 透明全屏遮罩层确保点击任意位置关闭

### 3.4 Showdown / PokePaste 导入导出

- `ShowdownImportDialog`：粘贴 Showdown 文本 → `EncounterMovesetGenerator` 解析 → 生成合法 PKM
- `ShowdownExportDialog`：一键导出为 Showdown 格式文本（可直接用于 Pokémon Showdown 对战模拟器）
- PokePaste 支持：导出到 PokePaste、从 PokePaste URL 导入
- 导入失败时 HaX 重试路径

### 3.5 雷达图能力值可视化（StatsChart）

- MudChart Radar 类型，6 维能力值（HP/ATK/DEF/SPA/SPD/SPE）
- 直观展示宝可梦强弱分布
- 350px 高度，100% 宽度

### 3.6 背包/道具编辑（Bag Editor）

- 多 Pouch Tab 页：道具/球/招式机/树果/重要物品/战斗道具等
- 每个 Pouch Tab 带精灵图标
- 按名称/数量/索引排序
- 数量编辑 + 收藏标记
- 「Show Empty Slots」开关
- 批量 Save 按钮

### 3.7 宝可梦图鉴管理

- 每种宝可梦的 Seen/Caught 复选框网格
- 按游戏版本过滤图鉴（LGPE 153物种 / SWSH Galar-only / LA Hisui-only / SV 区域图鉴 / ZA 个人表）
- 搜索（名称或图鉴编号）+ 分页
- Fill Pokédex / Seen All / Clear Pokédex 批量操作
- LA 世代：研究任务编辑器（所有任务类型 + Clear All Research）

### 3.8 训练家完整信息

- 多世代货币编辑器（金币/代币/BP/宝可里程/瓦特/Festival Coins/Roto Tokens/League Points）
- 训练家卡片对话框（Gen8 SwSh Card Name/Card Number/Trainer ID/Roto Rally Score）
- Gen6 Sayings 对话框
- 徽章组件（可视化徽章图标）
- 游戏同步 ID（Gen5/6/7/7b）
- 游戏开始时间和名人堂时间戳

---

## 四、低优先级锦上添花项

---

### 4.1 缎带/奖章编辑器

- 按类别分 Tab：Contest / Battle / Event / Memorial / Mark / Generation-Specific
- 缎带精灵图预览
- 逐枚合法性检查
- 搜索/筛选

### 4.2 客户端备份系统

- IndexedDB 存储备份
- 保留策略（自动清理旧备份）
- 恢复和逐条删除
- 自动备份（保存前自动创建备份点）
- pkmanager 的服务端天然做了存档版本管理，但可借鉴其 UI 交互模式

### 4.3 跨存档交换（Trade Tab）

- 同时加载两个存档（SaveFile A / SaveFile B）
- 双面板拖拽传输宝可梦
- 兼容性检查（世代/版本差异）
- 道具自动退回源存档背包

### 4.4 客户端偏好持久化

- localStorage 存储：主题模式（Light/System/Dark）、精灵风格（Game/Home）、合法性指示器可见性（Legal/Fishy/Illegal 独立开关）、触觉反馈开关
- `AppSettingsDialog` 支持设置导入/导出/重置

### 4.5 欢迎空状态 + 拖拽开档

- 首次使用时的品牌展示页（Logo + Welcome 标题 + 功能简介）
- 直接拖拽 .sav 文件到页面上打开（无需点击按钮）
- 提示支持的格式和特殊说明（如 Manic EMU .3ds.sav 直接支持）

### 4.6 触觉反馈

- `navigator.vibrate` 在关键交互时触发（iOS Safari 不支持）
- HapticCheckBox 组件包装
- 设置中可开关

### 4.7 PWA 支持

- Service Worker + 离线缓存
- 可安装为桌面/手机独立应用
- iOS 安全区域适配

### 4.8 存档文件诊断与修复

- 存档信息对话框：存档类型/世代/游戏版本/修订号/大小、Header/Footer 存在性、校验和状态（Valid/Invalid + 详情）、加密状态、可导出标志
- 修复工具：从主菜单触发存档修复操作

---

## 五、架构层面可借鉴的模式

### 5.1 集中化状态管理

PKMDS-Blazor 的 `IAppState` 接口集中管理所有全局状态：

```csharp
SaveFile? SaveFile         // 当前存档
PKM? CopiedPokemon         // 剪贴板
int? SelectedBoxNumber     // 当前选中
int? SelectedPartySlotNumber
bool IsHaXEnabled          // 非法模式开关
SpriteStyle SpriteStyle    // 精灵风格偏好
int? PinnedBoxNumber       // 固定箱子
bool ShowLegalIndicator    // 合法性指示器可见性开关
bool ShowFishyIndicator
bool ShowIllegalIndicator
bool HapticsEnabled        // 触觉反馈开关
```

pkmanager 的 Zustand store 可以借鉴这种单一状态源模式，将 `authStore` 和 `resourceStore` 扩展到覆盖存档编辑的全部全局状态。

### 5.2 合法性 UI 集中化

`LegalityUi.cs` 静态帮助类 —— 所有组件（报告 Tab、格子、导入对话框）都用同一套方法渲染合法性状态：

```csharp
public static Color GetStatusColor(LegalityStatus status) => status switch { ... };
public static string GetStatusIcon(LegalityStatus status) => status switch { ... };
public static string GetStatusLabel(LegalityStatus status) => status switch { ... };
public static string GetFirstIssue(LegalityAnalysis la) { ... };
```

保证全应用合法性展示的一致性。pkmanager 应在后端和前端的共享类型定义中采用类似模式。

### 5.3 自动化合法性引擎

`ILegalizationService` / `LegalizationService` 包装 PKHeX.Core 的 encounter 生成管线：

- 从模板/Showdown 文本生成合法 PKM（`EncounterMovesetGenerator` + Criteria）
- 保留原始 OT / 相遇 / 缎带信息
- 保留神秘礼物事件属性
- 失败时 HaX 重试路径（放宽限制再试）
- 合法性变更报告（记录修改了什么）

### 5.4 RefreshAwareComponent 基类模式

PKMDS-Blazor 所有组件继承 `RefreshAwareComponent` / `BasePkmdsComponent`，统一处理：

- 状态变更通知订阅
- 自动 UI 刷新
- 统一的 `AppState` 访问

pkmanager 可借鉴此模式，创建统一的 `useEditorStore` / `useSaveFile` hooks。

### 5.5 增量渲染优化

`BoxListDialog` 使用增量渲染策略：初始渲染少量箱子，滚动到可视区域时渲染更多，避免一次性渲染 32 个箱子（每个 30 格 = 960 个组件）导致卡顿。

---

## 六、pkmanager 的独特优势

pkmanager 相比 PKMDS-Blazor 有一些天然优势，应在借鉴时充分利用：

| pkmanager 优势 | 可发挥方向 |
|---------------|-----------|
| **PostgreSQL 服务端存储** | 跨设备同步、真正的云银行、存档历史版本追溯 |
| **用户账号体系** | 多用户、分享/交易、社区功能、权限控制 |
| **服务端 PKHeX.Core** | 批量运算不受浏览器性能限制、后台任务队列 |
| **REST API** | 未来可扩展移动 App、第三方集成、公开 API |
| **关系型数据库** | 全局搜索：按属性搜索全站宝可梦、统计分析、排行榜 |
| **服务端合法性验证** | 不能像 PKMDS-Blazor 一样被客户端绕过（HaX mode），数据更可信 |

**PKMDS-Blazor 不适合做的事（pkmanager 的优势领域）：**

1. 大量宝可梦的持久化存储和检索（PKMDS-Blazor 受 IndexedDB 限制）
2. 复杂的服务端搜索和分析（PKMDS-Blazor 只能客户端全量扫描）
3. 多用户协作和共享
4. 存档的长期版本历史管理
5. 后台批量任务（如全银行合法性重检）

---

## 七、总结建议

### 建议优先实现的 Top 5

| 优先级 | 功能 | 理由 |
|--------|------|------|
| 1 | **三态合法性 + 逐字段指示器** | 让合法性检查从"通过/不通过"变成可操作的指导，直接影响编辑体验 |
| 2 | **「全部箱子」弹窗** | 大幅提升箱子管理效率，pkmanager 当前最大交互短板 |
| 3 | **高级搜索 + 筛选器保存** | pkmanager 的 PostgreSQL 在这方面比客户端更强，应发挥优势 |
| 4 | **Encounter Database + 生成合法宝可梦** | 差异化功能，PKMDS-Blazor 受限于 WASM 性能 |
| 5 | **Batch Editor（批量编辑）** | 服务端批量处理更高效，且是 PKHeX 桌面版的明星功能 |

### 实施路线建议

- **Phase A**（近期）: 三态合法性升级 + 全部箱子弹窗 + 高级搜索基础版
- **Phase B**（中期）: Encounter Database + Batch Editor + 一键进化 + Showdown 导入导出
- **Phase C**（远期）: 形态编辑器 + 缎带编辑器 + 图鉴管理 + 跨存档交换

---

> **Sources:**
> - [PKMDS-Blazor GitHub Repository](https://github.com/codemonkey85/PKMDS-Blazor)
> - [PKHeX Parity Roadmap](https://github.com/codemonkey85/PKMDS-Blazor/blob/main/PKHEX_PARITY_ROADMAP.md)
> - [PKMDS Live App (pkmds.app)](https://pkmds.app/)
> - [Project Pokémon Forums Thread](https://projectpokemon.org/home/forums/topic/63302-pkmds-pok%C3%A9mon-save-editor-for-web/)
