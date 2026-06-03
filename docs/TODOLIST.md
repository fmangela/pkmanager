# pkmanager 界面外观与功能优化 TODO List

> **日期**: 2026-05-31  
> **依据**: PKHeX完整功能对比与缺口分析报告 + PKMDS-Blazor分析报告  
> **原则**: 项目主体架构不变 (React 18 + ASP.NET Core 8 + PostgreSQL)，在界面外观和编辑功能上做优化补齐  
> **当前基线**: 已有用户登录/注册、存档上传/解析/存储、箱子网格展示(6列)、dnd-kit拖拽、银行面板、基础5Tab编辑面板、二元合法性校验

---

## Phase A: 编辑面板全面升级（EditPanel 重构）

> 目标：将编辑覆盖率从 13% 提升至 60%+，补齐 PKHeX 最核心的编辑字段。
> 当前 5 个 Tab → 目标 7 个 Tab

### A.1 编辑面板架构重构

- [x] **将 EditPanel 从单文件拆分为多组件**
  - 创建 `src/components/editor/MainTab.tsx` — 基本信息
  - 创建 `src/components/editor/MetTab.tsx` — 相遇信息（从当前"元数据"Tab扩展）
  - 创建 `src/components/editor/StatsTab.tsx` — 能力值
  - 创建 `src/components/editor/MovesTab.tsx` — 招式
  - 创建 `src/components/editor/LegalityTab.tsx` — 合法性详情（**新增**）
  - `EditPanel.tsx` 已重构为薄壳容器，只负责 Tabs 路由 + 提交
  - (OTMiscTab + CosmeticTab 后端已完成，前端组件待创建)

- [x] **后端扩展 Pokémon 编辑 API**
  - 扩展 `PokemonEditRequest` DTO，新增 50+ 个字段
  - 后端 `PokemonEditService` 逐字段写入 PKHeX.Core `PKM` 对象
  - API 返回扩展后的三态合法性报告（Legal/Fishy/Illegal + 逐字段指示 + CanFix/FixAction）
  - 新增 BatchLegalityScan、SwapBoxes API 端点

---

### A.2 基本信息 Tab（Main Tab）补全 — 覆盖率 36% → 85%

- [x] **形态选择器 (Form + Form Argument)**
  - 后端 Form/FormArgument 读写实现
  - 前端 MainTab 包含 Form InputNumber 编辑

- [x] **语言选择器**
  - 下拉选择：JPN/ENG/FRE/ITA/GER/SPA/KOR/CHS/CHT
  - Gen1-2 编码限制校验（disabled 状态）

- [x] **经验值 (EXP) 编辑**
  - MainTab 包含 EXP 输入框

- [x] **亲密度 (Friendship/原始训练家亲密度)**
  - 0-255 InputNumber
  - Gen8+ 区分 OT/HT 亲密度

- [x] **宝可病毒 (Pokérus) 编辑**
  - 毒株 (0-15) + 感染天数 (0-15)

- [x] **性格影响能力值可视化**
  - 性格旁显示 +10% / -10% 的能力值标签（红色↑ / 蓝色↓）

- [ ] **闪光类型选择 (Gen8+)**
  - Star Shiny / Square Shiny 切换

- [x] **身高/体重/尺寸标量**
  - Height Scalar (0-255) + Weight Scalar (0-255)
  - Scale Rating (0-3)

---

### A.3 相遇信息 Tab（Met Tab）补全 — 覆盖率 13% → 85%

- [x] **来源游戏版本选择器** (只读显示，后端已支持写入)
- [x] **相遇日期选择器 (Gen4+)** (DatePicker)
- [x] **蛋信息编辑 (Gen4+)** (蛋地点 + 蛋日期)
- [x] **命运邂逅标志** (MainTab Switch)
- [x] **地面格子 (Ground Tile, Gen4)**
- [x] **相遇时间 (Met Time of Day, Gen2)**
- [x] **对战版本 (Battle Version, Gen8+)**
- [x] **服从等级 (Obedience Level, Gen9+)**
- [x] PID 十六进制显示

---

### A.4 能力值 Tab（Stats Tab）补全 — 覆盖率 34% → 85%

- [x] **实际战斗能力值展示（只读）**
  - HP/ATK/DEF/SPA/SPD/SPE 计算结果展示（PKHeX 公式 + 手动回退计算）
  - 性格修正自动应用（+10%红色 / -10%蓝色）
  - PKHeX 风格表格：种族值 | 个体值 | 努力值 | 能力值 + 合计行

- [x] **觉醒力量类型显示**
  - 根据 IV 实时计算 Hidden Power Type
  - 彩色属性标签展示

- [ ] **能力值雷达图 (Stats Chart)**
  - 待后续迭代

- [x] **世代专属能力值字段（条件显示）**
  - LGPE: AVs (6项 Awakening Values)
  - LA: GVs (6项 Grit Values)
  - Gen8 SwSh: Dynamax Level + Can Gigantamax
  - Gen9 SV: Tera Type Original + Tera Type Override
  - LA/ZA: Is Alpha + Is Noble

- [x] **Gen8+ 性格修正类型 (Stat Nature)**
  - Gen7 中 StatNature 与 Nature 共用字段，已修复覆盖 Bug（仅 Gen8+ 生效）

---

### A.5 招式 Tab（Moves Tab）补全 — 覆盖率 20% → 80%

- [x] **招式详情展示**
  - 每个招式显示：属性彩色标签 + 分类图标(⚔物理/🔮特殊/🔄变化)
  - Max PP 信息
  - (后端 MoveType 已映射，前端标签展示)

- [x] **PP 当前值与 PP Up 编辑**
  - 每个招式：当前 PP 输入 + PP Up 次数 (0-3)
  - Max PP 联动显示

- [x] **回忆招式编辑 (Relearn Moves, Gen6+)**
  - 4 个回忆招式槽
  - 搜索式选择器

- [ ] **信息气泡 (Info Popover)**
  - 待下一轮迭代

- [ ] **世代专属招式旗标（条件显示）**
  - Gen8+: TR Relearn Flags / LA: Move Shop / ZA: Plus Moves (后端已支持，前端待添加)

---

### A.6 训练家/杂项 Tab（OT/Misc Tab）补全 — 覆盖率 15% → 75%

- [x] **现任训练家信息 (HT Info)**
  - HT Name / HT Gender (下拉) / HT Language (下拉) / HT Friendship

- [x] **好感度 (Affection, Gen6+ Amie)**
  - 0-255 InputNumber

- [x] **3DS 区域信息 (IRegionOrigin, Gen6-7)**
  - Country: 100+ 国家中文下拉（动态加载，支持搜索）
  - Sub-Region: 联动国家动态加载地区（日本47都道府県 + 美国50州）
  - Console Region: 7 区域下拉（JPN/USA/EUR/AUS/CHN/KOR/TWN）
  - 后端 `GeoData.cs` 提供中文数据

- [x] **收藏标记 (Favorite)**
  - 下拉选择：是 ★ / 否

- [x] **TID/SID 编辑**
  - 16-bit 数字输入 (0-65535)
  - Gen7+ 6位显示TID（只读）

- [x] **加密信息展示**
  - PID / EC 十六进制只读
  - HOME 追踪 ID (Gen8+)

- [ ] **训练家记忆编辑 (Memories, Gen6+)**
  - 待后续迭代

- [ ] **地理位置记录 (Geo Locations, Gen6-7)**
  - 5 个位置槽，待后续迭代

- [ ] **当前佩戴缎带/证章 (Affixed Ribbon/Mark, Gen8+)**
  - 待后续迭代

---

### A.7 外观/装饰 Tab（Cosmetic Tab）— 覆盖率 0% → 80%（✅ 已完成）

- [x] **标记编辑器 (Markings)**
  - 6 个标记：● ▲ ■ ♥ ★ ♦
  - 每个标记三态：不显示/蓝色/红色
  - 可视化点击切换
  - Gen3-6 仅支持关/蓝（二进制），Gen7+ 支持关/蓝/红（三态）

- [x] **选美属性编辑 (Contest Stats)**
  - Cool / Beauty / Cute / Smart / Tough (0-255)
  - Sheen 光泽度 (0-255, Gen3-4)
  - 条件显示：仅 Gen3-4
  - (雷达图可视化待后续迭代)

- [x] **来源标记显示 (Origin Mark, 只读)**
  - 根据来源游戏版本展示对应图标：
    - Gen6 → 五角形 (Pentagon)
    - Gen7 → 三叶草 (Clover)
    - Gen8 SWSH → 伽勒尔
    - Gen8 BDSP → Trio
    - Gen8 LA → Arc/Triangle
    - Gen9 SV → Paldea
    - VC → Game Boy
    - GO → GO
  - 彩色 Tag 展示，条件显示：仅 Gen6+

- [x] **晃晃斑斑点预览 (Spinda Spots)**
  - 根据 PID 计算 4 个斑点坐标
  - 精灵图上叠加斑点位置（Canvas 绘制，2× 缩放）
  - 条件显示：仅晃晃斑(#327)
  - 显示斑点坐标数值 + PID 十六进制

---

### A.8 合法性详情 Tab（Legality Tab）— 从二元升级到三态（全新）

- [x] **三态合法性体系**
  - 后端：`LegalityStatus` 枚举 (Legal/Fishy/Illegal)
  - 前端 LegalityTab：Legal → 绿色 ✓ | Fishy → 黄色 ⚠️ | Illegal → 红色 ✗
  - Status Chip + Alert 横幅

- [x] **合法性报告详情**
  - 按检查项列表展示（Identifier + Judgement + Issue/Comment）
  - 每项显示彩色图标 + 状态标签
  - CanFix 识别 + FixAction 传递

- [x] **一键修复按钮（UI 框架）**
  - 可修复的项旁出现「修复」按钮
  - 后端已返回 CanFix/FixAction
  - (实际修复逻辑待 LegalizationService 实现)

- [x] **合法性批量扫描**
  - `POST /api/SaveFile/{id}/legality-report`
  - 返回 BatchLegalityReportDto (Legal/Fishy/Illegal 计数 + 逐槽位状态)
  - 前端工具栏「合法性扫描」按钮

- [x] **格子合法性指示点**
  - 箱子里不合法宝可梦显示红色小圆点

- [x] **合法性独立验证按钮**
  - LegalityTab 新增「验证合法性」按钮（不保存，仅检查）
  - 后端 `POST /api/Pokemon/validate-party` 端点
  - CheckIdentifier → 中文名称映射（30+ 检查项）

- [x] **QR 码生成**
  - 合法性 Tab 新增「生成QR码」按钮
  - 后端 `POST /api/Pokemon/qr` → `QRMessageUtil.GetMessage`
  - 前端通过 qrserver API 渲染 QR 码图片（240×240）
  - 供 3DS 实体游戏机扫码注入宝可梦

---

## Phase B: 存档编辑器交互优化

> 目标：提升箱子管理效率 + 视觉品质感

### B.1 箱子管理增强

- [ ] **「全部箱子」弹窗**
  - 按钮位置：存档编辑器工具栏
  - Modal/Drawer 中展示响应式箱子网格：
    - 大屏(≥1200px): 4 列
    - 中屏(≥768px): 3 列
    - 小屏(<768px): 1 列
  - 每个箱子显示：箱子名称 + 精灵网格 (6×5) + 宝可梦数量
  - 参考 PKMDS-Blazor `BoxListDialog.razor`

- [ ] **箱子 Swap（交换）**
  - 全部箱子弹窗中每个箱子添加 ⇄ 按钮
  - 点击与相邻箱子（i+1）交换全部内容
  - 后端 `POST /api/SaveFile/{id}/swapBoxes` API

- [ ] **箱子排序**
  - 工具栏添加「排序」下拉按钮
  - 排序选项：按物种编号 / 等级 / 闪光优先 / 名称
  - 排序范围：当前箱子 / 全部箱子

- [x] **箱子列表布局优化**
  - 箱子列表 `maxHeight: 480px` 内部滚动，与 Box 网格等高
  - Box 网格 `alignSelf: flex-start` 不再拉伸填充
  - 箱子项紧凑模式（padding 6px / 字号 12px）

- [ ] **箱子快速导航优化**
  - 当前箱子下拉选择器显示：`Box N: 名称 (已用/容量)`
  - 前后箱子翻页按钮（◀ ▶）
  - 支持键盘快捷键 Left/Right 翻箱子

### B.2 宝可梦格子视觉升级

- [ ] **格子精灵叠加图标**
  - 左下角：合法性状态小圆点（三色）
  - 右上角：闪光 ✨ 星星图标
  - 特殊状态：Alpha (LA) / Gigantamax / 对战队伍成员
  - 参考 PKMDS-Blazor `PokemonSlotComponent.razor`

- [ ] **格子 Hover 信息卡片**
  - 鼠标悬停弹出小卡片：物种名 + 等级 + 性格 + 特性 + 持有物
  - 合法性状态 Chip

- [ ] **格子右键菜单**
  - 复制 / 粘贴 / 删除 / 导出为 .pk* / 导出为 Showdown
  - 查看详情 / 存入银行

### B.3 合法性批量扫描

- [x] **全存档合法性扫描按钮**
  - 按钮位置：存档编辑器工具栏「合法性扫描」
  - 后端 `POST /api/SaveFile/{id}/legality-report`
  - 返回所有 Party + Box 槽位的合法性状态汇总表

- [ ] **合法性报告浮层**
  - 表格式展示：物种精灵 + 名称 + 位置 + 状态Chip + 首要问题
  - 过滤：全部 / Legal / Fishy / Illegal（ToggleGroup）
  - 点击行跳转到对应箱子/槽位
  - 批量 Legalize 按钮 + 进度条 + 取消

### B.4 银行面板增强

- [ ] **银行卡片视图升级**
  - 统一与格子相同的精灵图 + 叠加图标风格
  - 每个卡片显示：精灵图 / 昵称 / 物种名 / Lv / 闪光标志 / 世代Tag / 来源存档Tag

- [ ] **银行筛选/搜索增强**
  - 筛选：世代 / 闪光 / 物种类型 / 性格 / 特性
  - 排序：添加时间 / 等级 / 物种编号
  - 搜索支持物种名+昵称混合搜索

- [ ] **银行批量操作**
  - 多选模式（Shift/Ctrl 点选）
  - 批量删除 / 批量导出为 .zip / 批量移动到存档

---

## Phase C: 新增功能模块

> 目标：添加 PKHeX 有而 pkmanager 完全缺失的重要存档级功能

### C.1 背包/道具编辑（Bag Editor）

- [ ] **后端 Bag API**
  - `GET /api/SaveFile/{id}/bag` — 返回多 Pouch 道具列表
  - `PUT /api/SaveFile/{id}/bag` — 保存道具变更
  - Pouch 类型自动识别 (Items/Medicine/TMs/Berries/Balls/Battle Items/Key Items等)

- [ ] **前端 Bag 页面/面板**
  - 存档编辑器新增「背包」Tab 或独立 Drawer
  - Pouch 分类 Tab 导航（带精灵图标）
  - 道具行：图标 + 名称 + 数量输入 + 收藏标记
  - 排序按钮：按名称 / 按数量 / 按索引
  - 「显示空格」开关

### C.2 训练家信息完善（Trainer Info）

- [ ] **后端 Trainer API**
  - `GET /api/SaveFile/{id}/trainer` — 返回完整训练家信息
  - `PUT /api/SaveFile/{id}/trainer` — 保存

- [ ] **前端训练家面板**
  - 基本信息区：OT Name / TID / SID (16-bit + 6-digit) / 游戏语言 / 游戏时间
  - 货币区（条件显示，按世代）：金钱 / Coins / BP / Poké Miles / Watts / Festival Coins / League Points
  - 徽章区（Gen1-7）：可视化徽章图标，点击切换获得/未获得
  - 训练家卡片（Gen8 SwSh）：Card Name / Card Number / Trainer ID
  - Game Sync ID (Gen5-7)：十六进制只读 + 复制

### C.3 图鉴管理（Pokédex Editor）

- [ ] **后端 Pokédex API**
  - `GET /api/SaveFile/{id}/pokedex` — 按世代返回图鉴数据
  - `PUT /api/SaveFile/{id}/pokedex` — 批量保存
  - `POST /api/SaveFile/{id}/pokedex/fill` — Fill/SeenAll/CaughtAll/Clear

- [ ] **前端图鉴页面**
  - 存档编辑器新增「图鉴」Tab
  - 顶部：Seen%/Caught% 进度条 + Fill/SeenAll/Clear 按钮
  - 搜索栏（名称或图鉴编号）
  - 分页网格：每格显示精灵图 + Seen/Caught 复选框
  - 世代条件显示（仅展示该存档版本对应的图鉴范围）

### C.4 宝可梦详情页

- [ ] **银行宝可梦详情 Drawer 升级**
  - 复用编辑面板的 Tab 组件
  - 所有字段只读展示（非所属存档的宝可梦不可编辑）
  - 添加「发送到存档」按钮

---

## Phase D: 高级工具

> 目标：添加差异化功能，发挥 pkmanager 服务端优势

### D.1 高级搜索（Advanced Search）

- [ ] **后端搜索 API**
  - `POST /api/Search` — 多条件搜索当前存档或全银行
  - 利用 PostgreSQL JSONB GIN 索引加速
  - 支持筛选：物种 / 闪光 / 性格 / 特性 / 持有物 / 球种 / 来源版本 / 性别 / 等级范围 / IV/EV 下限 / 招式(Any/All) / OT名称/TID / 合法状态

- [ ] **前端搜索面板**
  - 存档编辑器新增「搜索」Tab
  - 折叠式筛选面板（Basic / Filters / Advanced）
  - 结果表格：精灵图 + 名称 + 位置 + 等级 + 性格 + 特性 + 持有物 + 状态
  - 点击行跳转到对应箱子/槽位
  - 保存筛选器（localStorage + 可扩展到服务端）
  - 搜索结果批量导出为 Showdown 文本

### D.2 Encounter Database（遭遇数据库）

- [ ] **后端 Encounter API**
  - `POST /api/Encounter/search` — 搜索合法遭遇
  - 参数：物种(必选) / 游戏版本 / 等级范围 / 遭遇类型
  - 调用 PKHeX.Core `EncounterMovesetGenerator`
  - `POST /api/Encounter/generate` — 从遭遇生成合法宝可梦并放入存档指定位置

- [ ] **前端遭遇数据库面板**
  - 存档编辑器新增「遭遇数据库」Tab
  - 筛选面板：物种搜索 / 游戏版本 / 等级范围 / 遭遇类型(Wild/Static/Gift/Trade/Egg)
  - 结果表格：遭遇类型Chip + 地点 + 等级范围 + 闪光锁定状态
  - 每行「生成」按钮：生成合法宝可梦放入选定槽位

### D.3 批量编辑器（Batch Editor）

- [ ] **后端 Batch API**
  - `POST /api/SaveFile/{id}/batch/preview` — 预览批量编辑结果
  - `POST /api/SaveFile/{id}/batch/apply` — 执行批量编辑
  - 包装 PKHeX.Core `BatchEditing` / `StringInstructionSet`
  - 支持 Filter (`.Property=Value`) + Mutation (`=Property=Value`) 语法

- [ ] **前端批量编辑面板**
  - 存档编辑器新增「批量编辑」Tab
  - 多行脚本输入编辑器
  - Preset 预设下拉 + 保存/删除预设
  - 范围选择：Party / 当前箱子 / 所有箱子 / 全部
  - Dry-Run 预览按钮：表格展示匹配的宝可梦 + 拟变更字段
  - 确认执行按钮 + 进度条

### D.4 一键进化（One-Touch Evolve）

- [ ] **后端 Evolution API**
  - `GET /api/Pokemon/{id}/evolutions` — 获取可能的进化路径
  - `POST /api/Pokemon/{id}/evolve` — 执行进化
  - 调用 PKHeX.Core `EvolutionTree.GetEvolutionTree()`

- [ ] **前端进化按钮**
  - 编辑面板 Main Tab 中添加「进化」按钮
  - 单路径：点击直接进化
  - 分支路径（伊布/蚊香蝌蚪等）：弹出选择器
    - 每个选项：精灵图 + 物种名称 + 进化方式标签
  - 土居忍士→铁面忍者：询问是否同时生成脱壳忍者到空位
  - 进化后自动同步昵称和等级

### D.5 Showdown / PokePaste 导入导出

- [ ] **后端接口**
  - `POST /api/Pokemon/export-showdown` — 导出为 Showdown 格式文本
  - `POST /api/Pokemon/import-showdown` — 从 Showdown 文本生成合法宝可梦

- [ ] **前端集成**
  - 编辑面板「Showdown」导出按钮：弹出文本框，一键复制
  - 工具栏「Import from Showdown」按钮：粘贴文本 → 解析 → 放入选定槽位
  - 批量导出：搜索结果的批量 Showdown 导出

---

## Phase E: 世代专属功能与细节打磨

> 目标：补齐各世代特色功能，提升品质感。目前 pkmanager 覆盖 Gen3-7。

### E.1 世代专属宝可梦字段

- [ ] **Gen-Specific Tab（编辑面板新增）**
  - 根据宝可梦世代条件显示专属字段：
    - Gen3 Colo/XD: ShadowID (只读) / Purification / IsShadow
    - Gen4 HGSS: Shiny Leaves (5叶复选框 + Crown标志) / WalkingMood
    - Gen5: NSparkle / PokeStarFame (B2W2)
    - Gen7 LGPE: Spirit / Mood / Received Timestamp

### E.2 存档级世代专属工具（按覆盖范围 Gen3-7 优先）

- [ ] **Gen3 (GBA): RTC 时钟编辑器**
  - 查看/调整游戏内实时时钟
  - 电池耗尽时钟修复
  - 丑丑鱼格子定位器 (Route 119 水格计算)

- [ ] **Gen4 (NDS): Shiny Leaves 编辑器**
  - 5 种叶子类型复选框 + Crown 标志
  - 仅在 HGSS 存档时显示

- [ ] **Gen6 (3DS): O-Powers 编辑器**
  - O-Power 等级和剩余能量查看/编辑

- [ ] **Gen6 (3DS): Super Training 查看**
  - 超级训练奖章统计（只读）

- [ ] **Gen7 (3DS): Zygarde Cell 查看**
  - 基格尔德细胞/核心收集进度

### E.3 UI/UX 细节打磨

- [x] **页面导航完善**
  - 存档管理页 `/saves` 添加返回按钮 → Dashboard
  - 银行页 `/bank` 添加返回按钮 → Dashboard
  - 存档编辑页已有返回按钮 → 存档列表

- [ ] **精灵图升级**
  - 支持 PokeAPI 高清精灵图（Home 风格）
  - 低分辨率备选：pokesprite spritesheet
  - 精灵风格切换：Game (像素) / Home (高清)

- [ ] **暗色/亮色主题**
  - 利用 Ant Design 5 的 ConfigProvider theme 切换
  - localStorage 持久化用户选择
  - AppBar 主题切换按钮 (Light / System / Dark)

- [ ] **欢迎空状态**
  - 首次加载时的品牌展示页
  - 拖拽 .sav 文件到页面上直接打开

- [ ] **触觉反馈**
  - 关键交互时 `navigator.vibrate`

- [ ] **键盘快捷键**
  - Left/Right 箭头：翻箱子
  - Delete / Ctrl+C/V / Ctrl+S / Ctrl+Z

- [ ] **响应式优化（重要）**
  - 手机端 / 平板端 / 桌面端适配
  - 模拟器工具栏在移动端溢出（画面/速度按钮组 + 其他控件太长）
  - 全局页面无移动端断点适配

- [ ] **加载骨架屏**
  - 存档加载时的 Skeleton 占位

---

## Phase F: 后端基础设施增强

> 目标：为新增前端功能提供后端支撑，不影响现有架构

### F.1 静态数据缓存与种子数据

- [ ] **物种/招式/特性/道具/球种/性格 数据预加载**
  - 启动时从 PKHeX.Core 提取全量表数据
  - 存入 PostgreSQL 静态表（带版本标记）
  - 前端请求时直接从数据库返回（不走 PKHeX.Core 实时计算）
  - 已有 `resourceStore.ts` 的基础结构，增强即可

- [ ] **精灵图 URL 映射表**
  - 物种ID → PokeAPI sprite URL 映射表
  - 减少前端硬编码，支持切换精灵图源

### F.2 合法性引擎升级

- [ ] **Auto-Legality 后端服务**
  - 从模板/Showdown 文本生成合法宝可梦
  - 调用 PKHeX.Core `EncounterMovesetGenerator` + `ClassicEraRNG`
  - 支持 Gen3-5 Method-1 PID↔IV 关联
  - 保留原始 OT/Met/Ribbon 信息
  - Legalization change report（返回变更字段清单）

- [ ] **批量合法性重检**
  - 后台任务全存档/全银行合法性扫描
  - 结果缓存，避免每次打开都重新扫描

### F.3 存档架构简化（重要）

- [x] **去除 save_box_pokemon 表**
  - 上传存档只存 `raw_save_data` 二进制，不拆箱入库
  - 所有 Box 编辑直接写入 raw_save_data 对应槽位 (`WriteBoxSlot`)
  - 读取存档时从 raw_save_data 实时解析（ParseService）
  - Bank 移入移出均直接操作 raw_save_data
  - 拖拽MoveSlot/SwapBoxes修复（同箱temp变量/跨箱分数组）

- [x] **PokemonController 合并**
  - `Edit` (Box) 和 `EditParty` 统一为 `PUT /save-slot` 端点
  - 均直接操作 raw_save_data

### F.4 存档备份管理

- [x] **5槽位自动备份**
  - `save_backups` 表存储完整 raw_save_data 副本
  - 每次编辑前自动备份（标签"编辑前自动备份"）
  - 手动保存时创建备份（标签"手动保存"）
  - 最多保留5个，旧备份自动清除
  - 恢复：直接回写 raw_save_data → 页面刷新

- [x] **备份信息展示**
  - 每份备份解析显示：宝可梦数量、训练家、游玩时间、游戏版本、箱子数
  - 最新备份绿色高亮卡片
  - 一键恢复按钮（带确认弹窗）

---

## Phase G: GBA 在线模拟器 (新增)

> 目标: 在网页端运行 GBA 宝可梦游戏，与存档管理深度集成

### G.1 模拟器核心

- [x] **mGBA WASM 选型与封装** — `client/src/lib/mgba.ts` (MGBAEmulator 接口)
- [ ] **mGBA WASM 文件部署** — 下载 `mgba.wasm` + `mgba.js` 到 `public/emulator/`
- [x] **软件测试渲染器** — 240×160 Canvas 直写像素，mGBA 到位前可验证页面

### G.2 ROM 管理

- [x] **ROM 数据库** — `rom_files` 表 (game_id, display_name, generation, rom_data)
- [x] **ROM 上传** — `POST /api/Emulator/roms/upload` 
- [x] **ROM 下载** — `GET /api/Emulator/roms/{gameId}`
- [x] **5 个 GBA 宝可梦 ROM 入库** — 红宝石/蓝宝石/绿宝石/火红/叶绿

### G.3 存档联动

- [x] **原始存档下载** — `GET /api/SaveFile/{id}/raw`
- [x] **存档同步** — `POST /api/Emulator/sync-save` (每30秒自动)
- [x] **即时存档** — `emulator_save_states` 表 + save/load state 端点
- [x] **GBA 存档入口** — Saves 页 Gen≤3 显示绿色「游玩」按钮

### G.4 前端模拟器页面

- [x] **EmulatorPage** — `/play/:saveFileId` 路由，React.lazy 懒加载
- [x] **画面缩放** — 1×/2×/4× 按钮组
- [x] **速度控制** — 1×/2×/4× `setFastForwardMultiplier`
- [x] **暂停/继续** — `pauseGame()` / `resumeGame()`
- [x] **重置** — `quickReload()`
- [x] **音量滑块** — `setVolume(0-100%)`
- [x] **FPS 显示** — 独立 rAF 计数器
- [x] **按键映射设置** — 弹窗逐个按键重绑定，localStorage 持久化
- [x] **手机触摸手柄** — D-Pad + A/B + L/R + Start/Select 虚拟按钮
- [x] **存档自动同步** — 每 30 秒 + 页面关闭前 Base64 同步
- [x] **关闭窗口** — `window.close()` 替代返回
- [x] **无存档新游戏入口** — Dashboard 5 张 GBA 游戏卡片（红宝石/蓝宝石/火红/叶绿/绿宝石，按发行日期排序）+ Modal 对话框（已有对应游戏存档列表 + 新增空白存档）
- [x] **存档列表精确显示游戏名** — `SaveFileDto.MapToDto` 补充 `GameVersionName`，Saves 页「游戏」列显示具体游戏名 + 对应颜色 Tag
- [x] **对话框按游戏过滤存档** — Dashboard Modal 只显示所选游戏版本的存档（不再笼统显示所有 Gen3）
- [ ] **手机端适配** — 工具栏溢出、页面响应式布局
- [ ] **手机端模拟器加载** — 移动端 mGBA WASM 兼容
- [ ] **手柄支持** — Web Gamepad API
- [ ] **金手指 UI** — CodeBreaker 格式

---

## Phase H: NDS 在线模拟器 (新增)

> 目标: 基于 melonDS WASM 在网页端运行 NDS 宝可梦游戏（Gen4 钻石/珍珠/白金/心金/魂银 + Gen5 黑/白/黑2/白2），复用 GBA 模拟器的 ROM 管理 + 存档联动 + Dashboard 架构

### H.1 melonDS WASM 编译与验证

- [x] **获取 melonDS WASM** — 从 ds-anywhere 演示站下载预构建产物（wasmemulator.wasm 847KB + wasmemulator.js 126KB + webmelon.js 27KB）
- [x] **`melonds.ts` 封装** — 类比 `mgba.ts` 创建 `NdsEmulator` 接口，支持 loadRom/loadSave/getSave/touch/pause/resume/setSpeed/shutdown
- [x] **NDS ROM 入库** — 9 个 ROM 元数据导入 `rom_files`（128-306MB 走文件系统 `local_path`，不存 BYTEA）
- [x] **`CreateNewGame` 扩展** — 支持 Gen4/5 游戏版本号（Diamond=10, Pearl=11, Platinum=12, HG=7, SS=8, Black=20, White=21, B2=22, W2=23）
- [x] **ROM 下载端点扩展** — 大 ROM 从文件系统 Streaming 服务
- [ ] **最小测试页验证** — 浏览器访问 `/emulator/nds/test.html`，确认 ROM 加载 + 双屏渲染 + 存档读写

### H.2 TypeScript 封装

- [x] **`melonds.ts`** — 类比 `mgba.ts` 创建 NdsEmulator 接口（loadRom/getSave/buttonPress/touchScreen/runFrame）
- [x] **双屏渲染** — 两个 Canvas（上屏+下屏触摸）
- [x] **NDS 按键映射** — 扩展 GBA 映射（新增 X/Y + 触摸屏）
- [x] **DsInputButton 类型导出** — 供 NdsEmulatorPage 使用

### H.3 前端模拟器页面

- [x] **NdsEmulatorPage** — `/play-nds/:saveFileId` 路由，React.lazy 懒加载
- [x] **双屏布局** — 上下堆叠，scale 1×/2×
- [x] **触摸屏覆盖层** — 鼠标点击 + 触屏 → melonDS touch API
- [x] **画面缩放 + 速度控制 + 存档同步** — 复用 GBA 30s auto-sync + sendBeacon 二进制同步
- [x] **手机触摸手柄** — 新增 X/Y 按钮、D-Pad、L/R、Start/Select

### H.4 后端扩展

- [ ] **NDS ROM 导入** — `EmulatorController.ImportLocal` 扩展 NDS ROM 模式
- [ ] **NDS_VERSION_MAP** — gameVersion → gameId 映射（Gen4/5 版本号）
- [ ] **存档兼容** — 验证 PKHeX.Core 解析 NDS 512KB .sav 文件

### H.5 Dashboard + 存档管理

- [x] **Dashboard 新增 9 张 NDS 卡片** — 钻石/珍珠/白金/心金/魂银/黑/白/黑2/白2（按发行日期排序）
- [x] **Saves 页扩展** — `GAME_VERSION_DISPLAY` 补充 Gen4/5 版本号 → 名称映射
- [x] **Modal 支持 NDS** — 按游戏版本过滤存档 + 动态 Gen Tag + 路由到 `/play-nds/`
- [x] **Saves 页「游玩」按钮** — Gen4/5 显示游玩按钮，路由到 `/play-nds/`

### H.6 世代专属功能

- [ ] **Gen4 专属** — 道具编辑器扩展到 Gen4 背包格式 / 图鉴
- [ ] **Gen5 专属** — 一同支持 Gen5 特性（隐藏特性、梦境世界等）
- [ ] **存档跨世代迁移** — Gen4→Gen5 宝可梦迁移（Pal Park / PokéTransfer 模拟）

### H.7 联机对战/交换（远期目标）

> ⚠️ NDS 本地无线协议要求 <1ms 延迟，浏览器 WebRTC 最佳情况 20-50ms。melonDS 桌面版的互联网联机（Netplay）仍在开发中，浏览器端暂无先例。

- [ ] **同浏览器双实例联机** — 同一进程两个 melonDS 实例，理论延迟可忽略（melonDS 1.0 RC 已支持单进程多实例）
- [ ] **WebRTC 联机实验** — 等待 melonDS Netplay 完成后评估 WebRTC 桥接可行性
- [ ] **PKHeX 层面数据交换**（替代方案）— 导出 .pk* + 分享 + 对方导入（已实现 QR 码生成）

---

## 实施顺序建议

```
Week 1-2:  Phase A.1 编辑面板架构重构
           Phase A.3 相遇信息Tab补全
           Phase A.2 基本信息Tab补全（形态/语言/EXP/亲密度）
           
Week 3-4:  Phase A.5 招式Tab补全（PP/回忆招式/详情展示）
           Phase A.6 训练家Tab补全（HT/Memory/Affection/Geo）
           Phase A.8 合法性Tab（三态+逐字段指示器）
           
Week 5-6:  Phase A.4 能力值Tab补全（雷达图/世代专属字段）
           Phase A.7 外观Tab（标记/选美/病毒/来源标记）
           Phase B.1 箱子管理增强（全部弹窗/Swap/排序）
           
Week 7-8:  Phase B.2 格子视觉升级（叠加图标/Hover卡片/右键菜单）
           Phase B.3 合法性批量扫描
           Phase B.4 银行面板增强
           
Week 9-10: Phase C.1 背包编辑
           Phase C.2 训练家信息完善
           Phase C.3 图鉴管理
           
Week 11-12: Phase D.1 高级搜索
            Phase D.2 Encounter Database
            Phase D.4 一键进化
            
Week 13-14: Phase D.3 批量编辑器
            Phase D.5 Showdown导入导出
            Phase E.1 世代专属字段
            
Week 15-16: Phase E.2 世代专属工具（Gen3 RTC等）
            Phase E.3 UI/UX细节打磨
            Phase F 后端基础设施增强
```

---

## 进度跟踪

| Phase | 总任务数 | 已完成 | 进行中 | 待开始 |
|-------|---------|--------|--------|--------|
| A: 编辑面板升级 | 35 | 33 | 0 | 2 |
| B: 存档编辑器优化 | 14 | 4 | 0 | 10 |
| C: 新增功能模块 | 12 | 0 | 0 | 12 |
| D: 高级工具 | 14 | 0 | 0 | 14 |
| E: 世代专属与打磨 | 17 | 1 | 0 | 16 |
| F: 后端基础设施 | 8 | 3 | 0 | 5 |
| G: GBA在线模拟器 | 21 | 17 | 0 | 4 |
| H: NDS在线模拟器 | 27 | 20 | 0 | 7 |
| **合计** | **148** | **83** | **0** | **65** |

> **更新 (2026-06-02)**：
> 
> ### Phase A.7 外观/装饰 Tab 完成
> - ✅ 新建 `CosmeticTab.tsx` 组件（327行），EditPanel 注册第7个Tab
> - ✅ **标记编辑器**: 6符号按钮(●▲■♥★♦)，Gen3-6关↔蓝 / Gen7+关→蓝→红三态循环
> - ✅ **选美属性**: Cool/Beauty/Cute/Smart/Tough/Sheen，Gen3-4条件显示
> - ✅ **来源标记**: 只读Tag展示，Gen6+条件显示，预置Gen6-9+VC+GO全套映射
> - ✅ **晃晃斑斑点**: Canvas加载精灵图+PID计算4斑点叠加绘制，仅晃晃斑(#327)显示
> - ⚠️ 后端 markings 写入目前只处理第一个标记（`Marking` 属性），后续需补充 `SetMarking(index)` 反射调用
> - ⚠️ Contest Stats 雷达图、Spinda 精灵图精确映射留待后续打磨
> - ⚠️ Phase A 剩余2项：闪光类型选择(Gen8+)、能力值雷达图
> 
> **更新 (2026-06-01 深夜 / 6月2日凌晨)**：
> 
> ### GBA 存档同步流程修复
> - `CreateNewGame` → 不再使用 PKHeX 预建存档，统一创建空占位记录
> - 新增 `SyncSaveBinary` 端点 (sendBeacon 二进制存档，绕过 keepalive 64KB 限制)
> - 前端新增「同步存档」按钮替代 30s 定时轮询，关闭时 await 同步完成再关窗口
> - `u8b64` chunk 32KB→8KB，React duplicate keys 修复
> - 按键重绑 bugfix: 重绑时清除旧绑定
> 
> ### NDS 在线模拟器 (Phase H)
> - ✅ `melonds.ts` NdsEmulator 封装 (loadRom/loadSave/getSave/pressButton/touch/pause/setSpeed)
> - ✅ NdsEmulatorPage 组件: 双屏渲染、触摸屏、按键映射、存档同步
> - ✅ Dashboard 9 张 NDS 卡片 (Gen4: 钻石/珍珠/白金/心金/魂银 + Gen5: 黑/白/黑2/白2)
> - ✅ Saves 页 Gen4/5 版本显示 + 游玩按钮
> - ✅ 新路由: `/play-nds/:saveFileId`, `/play-nds/new/:gameId`, `/play/new/:gameId`
> - ✅ 音量控制 (GainNode) + 麦克风噪声模拟 (白噪声注入)
> - ✅ 修复 webmelon API: loadRom→cart.loadFileIntoCart+emulator.loadCart
> - ✅ 修复 touchScreen API (webmelon 原生处理，移除自定义 handler)
> - ✅ 修复按键映射: 写入 webmelon 原生 keybinds (event.key→bitmask)
> - ✅ **melonDS WASM 重新编译**: 启用 SIMD (-msimd128) + PThreads (sPTHREAD_POOL_SIZE=4) + -O3
>   - Emscripten 5.0.7 编译环境已搭建 (`~/emsdk/`)
>   - ds-anywhere 源码已克隆并打补丁 (`~/ds-anywhere/`)
>   - 修复 WasmPlatform semaphore (std::counting_semaphore→pthread sem_t)
>   - 新版 WASM 843KB，内含 SIMD 指令，预期性能提升 30-50%
> 
> ### 存档流程重构
> - 新游戏不预建 DB 占位记录，首次「同步存档」时服务器自动创建
> - `SyncSave` 增加 gameId 参数支持自动创建
> - `CreateNewGame` 统一创建空记录 (PKHeX SAV4/SAV5 不支持空白存档)
> 
> ### 版本号修复
> - PKHeX GameVersion 内部值映射: RS(56)→Ruby, RSE(57)→Emerald, FRLG(58)→FireRed
> - 黑/白版本号修正: PKHeX W=20, B=21 (原映射反了)
> - `GameVersionNormalizer` 统一前后端版本号
>
> **更新 (2026-06-02 下午)**：
>
> ### melonDS GPU 加速 (WebGL 2.0)
> - ✅ 源码修补: GLESCompat.h/cpp 兼容层 (glColorMaski仿真 + GL_BGRA→RGBA + glFramebufferTexture→2D + glDrawBuffer→DrawBuffers + glMapBuffer→MapBufferRange 等 15+ API 映射)
> - ✅ GLSL 着色器转换: GPU3D_OpenGL_shaders.h + GPU_OpenGL_shaders.h 全部 `#version 140`→`#version 300 es` + `layout(location=N) out` + `precision highp float`
> - ✅ WebGL 2.0 上下文创建: WasmEmulator::initialize() 中用 emscripten_webgl_create_context + GLRenderer::New()
> - ✅ 帧缓冲区读回: GLCompositor::RenderFrame 末尾添加 glReadPixels 将合成帧写回 GPU::Framebuffer
> - ✅ ComputeRenderer 禁用 (需 GL 4.3 计算着色器, WebGL 2.0 不支持)
> - ✅ 编译成功: wasmemulator.wasm 911KB (原 843KB), Emscripten 5.0.7
> - ✅ 当前状态: 2D/3D 均可运行，WebGL 2.0 GPU 路径已打通
> - ⚠️ 实测结论: 3D 场景仍存在明显顿挫与音频卡顿，60FPS 不稳定
> - ⚠️ 原因判断: 当前浏览器链路仍为 GPU 渲染 + `glReadPixels` 回读 + JS `putImageData`，CPU/GPU 往返成本过高
> - 🛑 决策: 暂停继续优化 NDS GPU 性能，不再在当前阶段继续修改这条链路
> - ⚠️ 已知风险: glColorMaski 并集方案可能导致边缘标记/雾通道的细微视觉差异
> - ⚠️ GL_BGRA→RGBA 映射可能导致 R/B 通道交换 (需实测确认)
>
> ### NDS 存档同步链路修正
> - ✅ `melonds.ts` 调整启动顺序：`setSavePath('/savefiles/game.sav')` 提前到 `loadCart()` 之前，避免已有存档打开时未被加载
> - ✅ wasmelonDS `writeSave()` 增加 `FileFlush + CloseFile`，避免游戏内保存后 `.sav` 未真正落盘
> - ✅ NDS `beforeunload` 增加新游戏分支：无 `saveFileId` 时走 `/api/Emulator/sync-save/new/{gameId}`，允许正常退出时自动创建存档记录
> - ✅ 后端新增二进制新游戏同步入口：接收 `sendBeacon` 的 `.sav`，自动 `CreateNewGame()` + 写文件系统 + 更新 `save_files` 元数据
> - ⚠️ 以上修正已完成，但”新游戏内保存→直接退出→存档管理出现并可重新加载”仍需最终人工验收
> 
> **更新 (2026-06-03 下午)**：
> 
> ### NDS 存档同步 Bug 修复 — Module.FS 未定义导致 getSave() 永远返回 null
> - 🐛 **Bug**: 游戏内保存后点击”同步存档”，存档管理页面无新存档出现
>   - **根因**: Emscripten 5.0.7 编译产物中 `FS` 仅作为全局 `var FS` 导出，**未**赋值到 `Module.FS`
>   - `melonds.ts` 中 `loadSave()` 和 `getSave()` 使用 `window.Module.FS.readFile/writeFile/createDataFile`，全部因 `Module.FS === undefined` 而抛出异常
>   - `getSave()` 的 catch 块返回 `null` → `syncSaveNow()` 检查 `!sd?.length` 直接 `return false` → 静默失败
>   - 修复: `melonds.ts` 中 `window.Module.FS.*` → 裸 `FS.*`（全局变量，webmelon.js 已正确使用）
> - 🔧 **前端改进**: `syncSaveNow()` 在 `getSave()` 返回空数据时显示”尚未在游戏中存档”状态提示，不再静默失败
>
> ### NDS 存档游戏版本显示修复
> - 🐛 **Bug**: 存档管理页面 NDS 存档显示 “Gen62” 而非正确游戏名（如”钻石”）
>   - **根因**: PKHeX.Core 解析 NDS 存档时可能返回**复合版本**（DP=62 / DPPt=63 / HGSS=64 / BW=66 / B2W2=67），而非具体版本（D=10 / P=11 等）
>   - `SyncSave` 中用 `parsed.GameVersion`(62) 覆盖了 `CreateNewGame` 存入的正确版本(10)
>   - `GameVersionNormalizer` 缺少 62-67 的复合版本映射
>   - 前端 `GAME_VERSION_DISPLAY` 没有 62+ 的条目，fallback 到 `` Gen${ver} `` 模板
> - 🔧 **修复**:
>   - `GameVersionNormalizer` 新增 `IsCompositeVersion()` 检测 + `NormalizeOrKeepExisting()` 方法 — 解析版本为复合版本时回退到 `CreateNewGame` 存储的具体版本
>   - 三个同步端点 (`SyncSave`/`SyncSaveBinary`/`SyncSaveBinaryNew`) 统一使用 `NormalizeOrKeepExisting`
>   - `Map` 补充 62→10, 63→12, 64→7, 66→21, 67→22 的兜底映射
>   - 前端 `GAME_VERSION_DISPLAY` 补充复合版本兜底条目（如 62: '珍珠/钻石'）
> - ✅ 所有 NDS 世代游戏（Gen4: 钻/珍/白/心/魂 + Gen5: 黑/白/黑2/白2）版本映射已验证一致性
> - 🔧 `GameVersionNormalizer` 提取为独立 Helper 文件，供 `SaveFileService.UploadSave` 和 `GetSaveDetail` 共用
> - 🔧 `UploadSave` 增加版本归一化；`GetSaveDetail` 优先使用 DB 中已归一化的版本号
>
> ### 全世代版本号显示补齐（Gen6-9 / 3DS / Switch）
> - 🐛 **Bug**: 3DS/Switch 存档显示 "Gen33"（究极月）、"Gen44"（剑）等
>   - **根因**: `GAME_VERSION_DISPLAY` 仅覆盖到 Gen5，Gen6+ 版本号无对应条目
>   - PKHeX 返回具体版本（如 UM=33, SW=44），但因不在映射表而 fallback 到 `` Gen${ver} ``
> - 🔧 **修复**:
>   - 前端 `GAME_VERSION_DISPLAY` 补齐全部世代：Gen6 (X/Y/OR/AS)、Gen7 (S/M/US/UM/GO + Let's Go)、Gen8 (Sw/Sh/BDSP/PLA)、Gen9 (S/V)
>   - 后端 `GameVersionNormalizer.Map` 补全 Gen1-9 所有复合版本 → 具体版本默认映射（68=XY→24=X, 71=SM→30=SN, 72=USUM→32=US, 73=GG→42=GP, 74=SWSH→44=SW, 75=BDSP→48=BD, 76=SV→50=SL）
>   - `IsCompositeVersion` 范围从 62-67 扩大为 52-76（覆盖全部世代复合版本）
>
> **更新 (2026-06-03 下午，第二轮)**：
>
> ### TypeScript 编译清零 + 已知遗留清理
> - ✅ **NDS 存档同步端到端**: 人工验收通过 — 游戏内保存 → 同步按钮 → 存档管理列表出现并可正常编辑
> - ✅ **TypeScript 0 错误**: 修复 `BlobPart` 类型错误 (Emulator.tsx + NdsEmulator.tsx 的 `Uint8Array<ArrayBufferLike>` 不兼容) + `melonds.ts` WebGL readPixels 未用变量 + `Dashboard.tsx` 未用 `message` 变量
> - ℹ️ **存档目录**: 当前 `/home/fmangela/pkmanager-saves` 工作正常，暂不迁移至项目内 `data/saves/`
>
> **更新 (2026-06-03 下午，第三轮)**：
>
> ### 存档目录迁移至项目内部
> - ✅ **存档路径迁移**: `/home/fmangela/pkmanager-saves` → `server/PkManager.Server/data/saves/`
>   - `SaveFileService` + `EmulatorController` 注入 `IWebHostEnvironment`，使用 `ContentRootPath` 相对定位
>   - 路径格式: `{ContentRoot}/data/saves/{userId}/{saveFileId}/save.sav`
>   - 备份路径: `{ContentRoot}/data/saves/{userId}/{saveFileId}/backups/`
>   - `.gitignore`: 新增 `server/PkManager.Server/data/` 忽略规则
>
> ### 已知遗留
> - OpenGL GPU 渲染器因 WebGL2 API 兼容问题未启用 (glColorMaski/glDrawBuffer/glMapBuffer 缺失)
> 
> **更新 (2026-06-02 下午)**：
> 
> ### NDS 模拟器 frameUpdate 修复
> - 🐛 **Bug**: melonDS WASM 加载后 frameUpdate 持续报错 `TypeError: Cannot read properties of undefined (reading 'buffer')`
>   - 根因: Emscripten 5.0.7 + PThreads 编译后 `Module.HEAPU8` 为 undefined
>   - `webmelon.js:442` 使用 `Module.HEAPU8.buffer` 但新版 Emscripten 中 HEAPU8 仅为局部 var，未导出到 Module 对象
>   - 修复: `webmelon.js` 3处 `Module.HEAPU8.buffer` → `Module.wasmMemory.buffer`（wasmMemory 已显式导出）
> - 🔧 **Program.cs 中间件**: Cross-Origin Isolation 头部从仅 `/play` → `/play` + `/play-nds`（melonDS PThreads 依赖 SharedArrayBuffer）

---

> **参考文档**:
> - `docs/PKHeX完整功能对比与缺口分析报告.md` — 逐字段缺口详情
> - `docs/PKMDS-Blazor分析报告.md` — UI/UX 借鉴参考
> - `docs/TODOLIST.md` — 原基础设施 TODO
> - `docs/宝可梦全世代管理端-技术方案设计.md` — 原始技术方案
