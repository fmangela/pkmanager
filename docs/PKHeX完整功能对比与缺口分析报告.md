# PKHeX 完整功能对比与 pkmanager 编辑能力缺口分析报告

> **分析日期**: 2026-05-30  
> **分析对象**: [PKHeX](https://github.com/kwsch/PKHeX) (Windows 桌面版存档编辑器)  
> **对比基准**: pkmanager (宝可梦全世代管理端) 当前 `EditPanel.tsx` + 后端编辑 API  
> **参考来源**: PKHeX 源码 (WinForms Controls) + PKMDS-Blazor PKHEX_PARITY_ROADMAP.md

---

## 目录

1. [PKHeX 完整功能全景图](#一pkhex-完整功能全景图)
2. [pkmanager 当前编辑能力现状](#二pkmanager-当前编辑能力现状)
3. [宝可梦编辑器（PKM Editor）逐字段缺口分析](#三宝可梦编辑器pkm-editor逐字段缺口分析)
4. [存档编辑器（SAV Editor）功能缺口分析](#四存档编辑器sav-editor功能缺口分析)
5. [世代专属功能缺口](#五世代专属功能缺口)
6. [高级工具缺口](#六高级工具缺口)
7. [优先级排序与实施建议](#七优先级排序与实施建议)

---

## 一、PKHeX 完整功能全景图

PKHeX 桌面版是宝可梦存档编辑的事实标准，包含两大编辑器 + 数十个子工具。

### 1.1 PKM Editor（宝可梦编辑器）— 6 个核心 Tab

```
┌────────────────────────────────────────────────────────┐
│  PKM Editor                                            │
│  ┌──────────┬──────────┬──────────┬──────────┬────────┐│
│  │ Tab_Main │ Tab_Met  │Tab_Stats │Tab_Moves │Tab_OT  ││
│  │          │          │          │          │ Misc    ││
│  ├──────────┴──────────┴──────────┴──────────┴────────┤│
│  │ Tab_Cosmetic (Hidden)                               ││
│  ├─────────────────────────────────────────────────────┤│
│  │ Legality Checker (实时)                              ││
│  └─────────────────────────────────────────────────────┘│
└────────────────────────────────────────────────────────┘
```

### 1.2 SAV Editor（存档编辑器）— 主窗口

PKHeX 存档编辑器包含以下功能模块：

**存档级功能：**
| 模块 | 说明 |
|------|------|
| Box/Party | 箱子网格 + 随行宝可梦，拖拽管理 |
| Bag/Inventory | 多Pouch背包编辑 |
| Trainer Info | 训练家名称、TID/SID、货币(多世代)、徽章、游戏时间、语言 |
| Pokédex | 世代专属图鉴编辑 (Gen1-9各有独立编辑器) |
| Records | 游戏统计与名人堂 |
| Mystery Gift DB | 神秘礼物数据库浏览/导入/生成 |
| Encounter DB | 遭遇数据库浏览/生成 |
| Battle Box/Teams | 对战箱 + 对战队伍 + 租借队伍 |
| Event Flags | 事件旗标与 Work 值编辑 |
| Block Data | 原始数据块查看/编辑 |
| Box List/Popout | 全部箱子弹窗/独立箱子窗口 |
| Advanced Search | 多条件搜索 |

**世代专属子工具 (按 Gen):**

| Gen | 子工具 |
|-----|--------|
| Gen1 | EventReset, HallOfFame |
| Gen2 | Misc |
| Gen3 | RTC, Roamer, SecretBase, Misc, HallOfFame, PokeBlock |
| Gen4 | Apricorn, BattlePass, Gear, Geonet, HoneyTree, Misc, Pokeathlon, Pokédex, Trainer(BR), Underground |
| Gen5 | DLC, JoinAvenue, Medals, Misc, Pokédex, UnityTower |
| Gen6 | BerryField, BoxLayout, HallOfFame, Link, OPower, PokeBlock, Pokédex(XY/ORAS), Pokepuff, Roamer, SecretBase, SuperTrain, Trainer |
| Gen7 | Capture(GG), FestivalPlaza, HallOfFame, Pokebean, Pokédex(SM/GG), Trainer(7/GG), ZygardeCell |
| Gen8 | BlockDump, FlagWork, Misc, Poffin, Pokédex(SWSH/BDSP/LA), Raid, SealStickers, Trainer(8/8a/8b), Underground |
| Gen9 | Donut, Fashion, FlagWork, Pokédex(SV/Kitakami/ZA), Raid(9/SevenStar), Trainer(9/9a) |
| Misc | Accessor(块数据), Chatter, EventFlags, GroupViewer, Inventory, Mailbox, Wondercard |

---

## 二、pkmanager 当前编辑能力现状

### 2.1 当前 EditPanel.tsx 的 5 个 Tab

| Tab | 包含字段 | PKHeX 覆盖率 |
|-----|---------|-------------|
| 基本信息 | species, nickname, gender, level, nature, ability, heldItem, ball, isShiny, isEgg | ~15% |
| 能力值 | 6项 IV + 6项 EV | ~25% |
| 招式 | 4个招式槽 (moveId only) | ~20% |
| 训练家 | otName, tid, sid | ~10% |
| 元数据 | PID(只读), metLocation, metLevel | ~10% |

### 2.2 完全缺失的 Tab

- ❌ Met Tab（相遇信息详情）
- ❌ Cosmetic Tab（外观/选美/病毒/标记/体型）
- ❌ Ribbons Tab（缎带/奖章）
- ❌ Legality Tab（详细合法性报告 + 一键修复）
- ❌ Gen-Specific Tab（世代专属字段）
- ❌ Moves Detail（PP/PP Up/回忆招式/TR旗标/招式大师等）
- ❌ Batch Editor（批量脚本编辑）

### 2.3 后端已有的编辑 API 字段

```typescript
// 当前 EditPanel 提交的数据 (handleSubmit)
{
  species, nickname, gender, level, nature, ability, heldItem, ball,
  isShiny, isEgg,
  ivs: [6], evs: [6],
  moves: [4],
  otName, tid16, sid16,
  metLocation, metLevel
}
```

即 pkmanager 前后端目前总共只能编辑 **约 25 个字段**，而 PKHeX 支持编辑 **200+ 字段**。

---

## 三、宝可梦编辑器（PKM Editor）逐字段缺口分析

### 3.1 Main Tab（基本信息）— 覆盖率 ~15%

PKHeX 的 Main Tab 包含的字段远多于 pkmanager：

| PKHeX 字段 | pkmanager 状态 | 说明 |
|------------|---------------|------|
| Species | ✅ 有 | |
| Nickname | ✅ 有 | 但缺少字符集校验 (Gen1-2 编码限制) |
| Gender | ✅ 有 | 缺少性别锁定提示（某些物种只有单一性别） |
| Level | ✅ 有 | 缺少经验值联动 (Experience 字段) |
| Nature | ✅ 有 | |
| Ability | ✅ 有 (ability slot) | 需支持 Ability 1/2/HA 三槽位选择 + 自由模式 |
| Held Item | ✅ 有 | |
| Ball | ✅ 有 | |
| Is Shiny | ✅ 有 | 缺少 Shiny 类型选择 (Star/Square, Gen8+) |
| Is Egg | ✅ 有 | |
| **Friendship** | ❌ 缺失 | 亲密度 (0-255) |
| **Form** | ❌ 缺失 | 形态选择 (如洛托姆、未知图腾、多形态宝可梦) |
| **Form Argument** | ❌ 缺失 | 形态参数 (如阿尔宙斯属性、银伴战兽记忆) |
| **Language** | ❌ 缺失 | 宝可梦获取语言 (JPN/ENG/FRE/ITA/GER/SPA/KOR/CHS/CHT) |
| **EXP** | ❌ 缺失 | 当前经验值 |
| **PKRS (Pokérus)** | ❌ 缺失 | 病毒株 + 感染天数 |
| **Fateful Encounter** | ❌ 缺失 | 命运邂逅标志 |
| **PID** | ⚠️ 只读显示 | 缺少 PID 生成器 (Method 1/2/4/Shiny/Gender) |
| **EC (Encryption Constant)** | ❌ 缺失 | 加密常数 (Gen6+) |
| **Height/Weight** | ❌ 缺失 | 身高/体重标量 |
| **Scale** | ❌ 缺失 | 尺寸评级 (Gen8 LA/SV 的 XS/S/M/L/XL) |

### 3.2 Stats Tab（能力值）— 覆盖率 ~25%

| PKHeX 字段 | pkmanager 状态 | 说明 |
|------------|---------------|------|
| IVs (6项) | ✅ 有 | Gen1-2 限制为 0-15 |
| EVs (6项) | ✅ 有 | 缺 EV 总和校验 (510上限) |
| **Calculated Stats** | ❌ 缺失 | 实际战斗能力值 (HP/ATK/DEF/SPA/SPD/SPE) |
| **AVs (6项)** | ❌ 缺失 | Awakening Values (LGPE 专属) |
| **GVs (6项)** | ❌ 缺失 | Grit Values (Legends Arceus 专属) |
| **CP** | ❌ 缺失 | Combat Power (LGPE) |
| **Stat Nature** | ❌ 缺失 | 性格修正类型 (Gen8+) |
| **Dynamax Level** | ❌ 缺失 | 极巨化等级 (Gen8 SwSh) |
| **Can Gigantamax** | ❌ 缺失 | 可超极巨化标志 |
| **Tera Type Original** | ❌ 缺失 | 原始太晶属性 (Gen9 SV) |
| **Tera Type Override** | ❌ 缺失 | 覆盖太晶属性 |
| **Is Alpha** | ❌ 缺失 | 头目标志 (LA/ZA) |
| **Is Noble** | ❌ 缺失 | 王/女王宝可梦 (LA) |
| **Stats Chart** | ❌ 缺失 | 雷达图可视化 |
| **Hacked Stats** | ❌ 缺失 | HaX 模式下手动修改战斗能力值 |
| **Hidden Power Type** | ❌ 缺失 | 觉醒力量属性类型展示/选取 |

### 3.3 Moves Tab（招式）— 覆盖率 ~20%

| PKHeX 字段 | pkmanager 状态 | 说明 |
|------------|---------------|------|
| Move 1-4 | ✅ 有 (仅ID) | 缺招式类型图标、分类(物理/特殊/变化)、威力/PP/命中展示 |
| **PP / PP Ups** | ❌ 缺失 | 每个招式的当前PP和PP提升次数 |
| **Relearn Moves (4)** | ❌ 缺失 | 回忆招式槽 (Gen6+) |
| **Move Type Icons** | ❌ 缺失 | 招式属性彩色图标 |
| **Move Category** | ❌ 缺失 | 物理⚔/特殊🔮/变化🔄 (世代精确判定) |
| **TR Relearn Flags** | ❌ 缺失 | 技术记录学习标志 (Gen8+) |
| **Move Shop Flags** | ❌ 缺失 | 招式商店购买/精通标志 (LA) |
| **Mastered Moves** | ❌ 缺失 | 招式精通标志 (LA) |
| **Plus Moves** | ❌ 缺失 | Plus 招式标志 (ZA) |
| **Alpha Move** | ❌ 缺失 | 头目专属招式选择 (LA) |

### 3.4 Met Tab（相遇信息）— 覆盖率 ~10%

pkmanager 的"元数据"Tab 只有 3 个字段，PKHeX Met Tab 包含：

| PKHeX 字段 | pkmanager 状态 | 说明 |
|------------|---------------|------|
| Met Location | ✅ 有 (数字) | 应以名称展示 + 搜索选择 |
| Met Level | ✅ 有 | |
| **Met Ball** | ❌ 缺失 | 相遇时的精灵球 (已移到基本信息Tab) |
| **Origin Game** | ❌ 缺失 | 来源游戏版本 |
| **Met Date** | ❌ 缺失 | 相遇日期 (Gen4+) |
| **Egg Location** | ❌ 缺失 | 蛋获得地点 (Gen4+) |
| **Egg Date** | ❌ 缺失 | 蛋获得日期 (Gen4+) |
| **Ground Tile** | ❌ 缺失 | 地面格子 (Gen4) |
| **Met Time of Day** | ❌ 缺失 | 相遇时间 (Gen2) |
| **Battle Version** | ❌ 缺失 | 对战版本 (Gen8+) |
| **Obedience Level** | ❌ 缺失 | 服从等级 (Gen9+) |

### 3.5 OT/Misc Tab（训练家/杂项）— 覆盖率 ~10%

| PKHeX 字段 | pkmanager 状态 | 说明 |
|------------|---------------|------|
| OT Name | ✅ 有 | |
| TID/SID | ✅ 有 (16-bit) | 缺 6-digit Display TID/SID 格式 (Gen7+) |
| **HT Name** | ❌ 缺失 | 现任训练家名称 (Handling Trainer) |
| **HT Gender** | ❌ 缺失 | 现任训练家性别 |
| **HT Language** | ❌ 缺失 | 现任训练家语言 |
| **HT Memory** | ❌ 缺失 | 现任训练家记忆 (Gen6+) |
| **OT Memory** | ❌ 缺失 | 原始训练家记忆 (Gen6+) |
| **Memory Intensity/Feeling/Text** | ❌ 缺失 | 记忆强度/感受/文本变量 |
| **Affection** | ❌ 缺失 | 好感度 (Gen6+ Amie) |
| **Geo Locations (5)** | ❌ 缺失 | 地理位置记录 (Gen6-7) |
| **Home Tracker** | ❌ 缺失 | HOME 追踪ID (Gen8+) |
| **Country** | ❌ 缺失 | 国家 (IRegionOrigin, Gen6-7) |
| **Sub-Region** | ❌ 缺失 | 子区域 |
| **Console Region** | ❌ 缺失 | 主机区域 |
| **Affixed Ribbon/Mark** | ❌ 缺失 | 当前佩戴的缎带/证章 (Gen8+) |
| **Handling Trainer Name** | ❌ 缺失 | HT名称 (Gen8+) |
| **Favorite** | ❌ 缺失 | 收藏标记 (Gen7b+) |

### 3.6 Cosmetic Tab（外观/装饰）— 覆盖率 0%

整个 Cosmetic Tab 在 pkmanager 中完全不存在：

| PKHeX 字段 | pkmanager 状态 | 说明 |
|------------|---------------|------|
| **Markings (6)** | ❌ 缺失 | 6种标记 (●▲■♥★♦) |
| **Contest Stats** | ❌ 缺失 | Cool/Beauty/Cute/Smart/Tough + Sheen (Gen3-4) |
| **Pokérus Strain** | ❌ 缺失 | 宝可病毒毒株类型 + 感染剩余天数 |
| **Height/Weight** | ❌ 缺失 | 身高/体重标量 (精确浮点) |
| **Scale Rating** | ❌ 缺失 | 尺寸评等 |
| **Origin Mark** | ❌ 缺失 | 来源标记(只读显示) — 五角形/三叶草/伽勒尔/洗翠等 |
| **Spinda Spots** | ❌ 缺失 | 晃晃斑斑点预览 (PID → 4点坐标) |

### 3.7 Ribbons Tab（缎带/奖章）— 覆盖率 0%

PKHeX 支持 100+ 种缎带和奖章的查看/编辑，分为：
- **Contest Ribbons** (选美大赛): Cool/Beauty/Cute/Smart/Tough 各级
- **Battle Ribbons** (对战): Battle Tower/Tree/Maison 等
- **Event Ribbons** (活动): Classic/Premier/Event 等
- **Memorial Ribbons** (纪念): 特定NPC赠送
- **Mark Ribbons** (证章, Gen8+): 天气/时间/性格等稀有证章
- **Generation-Specific** (世代专属): 各地特有缎带

pkmanager 当前无法查看/编辑任何缎带。

### 3.8 Legality Tab（合法性检查）— 覆盖率 ~30%

| PKHeX 功能 | pkmanager 状态 |
|------------|---------------|
| 基础 LegalityAnalysis | ✅ 有 (但只有二元 valid/invalid) |
| 三态合法性 (Legal/Fishy/Illegal) | ❌ 只有二元 |
| 按检查项分组详情 | ❌ 只有文本 report |
| 逐字段内联合法性指示器 | ❌ |
| 一键修复按钮 (Fix Ball/Fix Moves/Fix Met) | ❌ |
| 批量合法性扫描 (全Party+Box) | ❌ |
| 合法的编辑建议 | ❌ |

---

## 四、存档编辑器（SAV Editor）功能缺口分析

### 4.1 Box/Party 管理

| PKHeX 功能 | pkmanager 状态 | 优先级 |
|------------|---------------|--------|
| 箱子网格展示 | ✅ 有 (6列) | — |
| 拖拽交换 | ✅ 有 (dnd-kit) | — |
| 随行宝可梦展示 | ✅ 有 | — |
| **全部箱子弹窗** | ❌ | 🔴 高 |
| **独立箱子弹出窗口** | ❌ | 🟡 中 |
| **箱子列表网格视图** | ❌ | 🔴 高 |
| **箱子 Swap** | ❌ | 🟡 中 |
| **箱子排序** (按物种/等级/闪光) | ❌ | 🟡 中 |
| **箱子搜索/筛选** | ❌ | 🟡 中 |
| **箱子克隆** | ❌ | 🟢 低 |
| **箱子导出/导入** | ❌ | 🟢 低 |
| **箱子壁纸** | ❌ | 🟢 低 |
| **Pin 箱子** | ❌ | 🟢 低 |
| **多选批量操作** | ❌ | 🟡 中 |
| **盒子组视图 (Group Viewer)** | ❌ | 🟢 低 |

### 4.2 Bag/Inventory（背包/道具）

完全缺失。PKHeX 支持：

- 多 Pouch 分页 (道具/球/招式机/树果/重要物品/战斗道具等)
- 数量编辑 (0-999)
- 收藏标记
- 排序 (名称/数量/索引)
- 空位显示开关
- HaX 模式无限制道具

### 4.3 Trainer Info（训练家信息）

当前只有名称和 TID/SID，缺失大量信息：

| PKHeX 字段 | 状态 |
|------------|------|
| OT Name | ✅ |
| TID/SID | ✅ |
| **Money** | ❌ 多世代货币编辑器 |
| **Coins** (代币) | ❌ |
| **BP** (对战点数) | ❌ |
| **Poké Miles** | ❌ |
| **Festival Coins** | ❌ |
| **Watts** | ❌ |
| **Roto Tokens** | ❌ |
| **League Points** | ❌ |
| **Badges** (徽章) | ❌ 可视化徽章编辑 |
| **Playtime** (游戏时间) | ❌ |
| **Language** (游戏语言) | ❌ |
| **Game Sync ID** | ❌ |
| **Trainer Card** (训练家卡片) | ❌ |
| **Game Start Timestamp** | ❌ |
| **Hall of Fame Timestamp** | ❌ |
| **Gen6 Sayings** | ❌ |

### 4.4 Pokédex（图鉴）

完全缺失。PKHeX 的图鉴编辑按世代分为：

- **Gen1-3**: 简单 Seen/Caught 位旗标
- **Gen4**: 性别×闪光 Seen 追踪 + 形态追踪 (未知图腾×28 等) + 语言旗标 + Spinda PID
- **Gen5**: 4区性别×闪光 + 展示变体 + 语言旗标 (7语言)
- **Gen6 XY**: 4区性别×闪光 + 形态旗标 + 语言旗标 + "Foreign"旗标
- **Gen6 ORAS**: 上述全部 + 遭遇计数 + 获得计数
- **Gen7 SM/USUM**: 4区性别×闪光 + 形态旗标 + 语言旗标 (9语言) + Spinda×4 + 区域/全国模式
- **Gen7b LGPE**: 简单 Seen/Caught (仅153物种)
- **Gen8 SWSH**: 3个独立区域图鉴块 (Galar/Armor/Crown) + Gigantamax旗标 + 对战计数
- **Gen8 BDSP**: 4状态系统 + 性别×闪光旗标 + 区域/全国旗标
- **Gen8 LA**: 完全不同的架构 — 研究任务进度系统 (Each species: 22+ task types)
- **Gen9 SV**: 3级 DLC 图鉴 (Paldea/Kitakami/Blueberry) + 4状态系统

通用操作：Fill/SeenAll/CaughtAll/Clear/CompleteDex

### 4.5 Records / Hall of Fame / 其他存档子工具

| 功能 | 状态 |
|------|------|
| Records (游戏统计) | ❌ |
| Hall of Fame (名人堂) | ❌ |
| Mystery Gift Database | ❌ |
| Encounter Database | ❌ |
| Battle Box / Teams | ❌ |
| Event Flags / Work | ❌ (高风险) |
| Block Data Viewer | ❌ (高风险) |
| Save File Info | ❌ |
| Save File Repair | ❌ |
| Backup Manager | ❌ |
| Save Comparison | ❌ |
| Save Format Converter | ❌ |

---

## 五、世代专属功能缺口

按 pkmanager 当前只覆盖 Gen3-7 的范围：

### Gen3 (GBA) 专属

| 功能 | 状态 |
|------|------|
| RTC 实时时钟编辑器 | ❌ |
| Roamer 游走宝可梦编辑器 | ❌ |
| Secret Base 秘密基地 | ❌ |
| Misc3 杂项编辑 | ❌ |
| PokeBlock Case | ❌ |
| Battle Frontier 对战开拓区符号 | ❌ |
| **Colosseum/XD Shadow PKM** (ShadowID/Purification) | ❌ |
| Hall of Fame 3 | ❌ |

### Gen4 (NDS) 专属

| 功能 | 状态 |
|------|------|
| HGSS Shiny Leaves (5叶+Crown) | ❌ |
| HGSS WalkingMood | ❌ |
| HGSS NSparkle | ❌ |
| Pokéwalker | ❌ |
| Underground | ❌ |
| Pokéathlon | ❌ |
| Battle Frontier | ❌ |
| Honey Tree | ❌ |
| Apricorn | ❌ |
| Safari Zone (HGSS) | ❌ |
| Seal/Ball Capsule | ❌ |
| Pokétch | ❌ |
| Villa Furniture (Platinum) | ❌ |
| Feebas Tile Locator | ❌ |

### Gen5 (NDS) 专属

| 功能 | 状态 |
|------|------|
| B2W2 PokéStar Fame | ❌ |
| N's Sparkle (PK5) | ❌ |
| Entralink | ❌ |
| Medals (奖章系统) | ❌ |
| Join Avenue | ❌ |
| Musical | ❌ |
| C-Gear Skin | ❌ |
| Dream World | ❌ |
| PWT (宝可梦世锦赛) | ❌ |
| Battle Subway | ❌ |
| DLC/Black City/White Forest | ❌ |
| Pass Powers | ❌ |

### Gen6 (3DS) 专属

| 功能 | 状态 |
|------|------|
| O-Powers | ❌ |
| Pokémon-Amie Affection | ❌ |
| Super Training | ❌ |
| Berry Field | ❌ |
| ORAS Secret Base | ❌ |
| Soaring Locations (ORAS) | ❌ |
| Mirage Spots (ORAS) | ❌ |
| Eon Ticket | ❌ |
| PSS Settings | ❌ |

### Gen7 (3DS) 专属

| 功能 | 状态 |
|------|------|
| Festival Plaza | ❌ |
| Poké Pelago | ❌ |
| Zygarde Cell Collection | ❌ |
| Battle Agency | ❌ |
| Mantine Surf | ❌ |
| Ultra Wormhole | ❌ |
| **LGPE Spirit/Mood/Received Timestamp** | ❌ |
| **LGPE AVs (6项) + CP** | ❌ |
| LGPE Capture Combo | ❌ |

---

## 六、高级工具缺口

### 6.1 已由 PKMDS-Blazor 实现但 pkmanager 缺失的工具

| 工具 | 说明 |
|------|------|
| **Batch Editor** | 脚本化批量编辑 (StringInstructionSet)，支持筛选+修改+预览 |
| **Encounter Database** | 遭遇数据库浏览 + 筛选 + "生成合法宝可梦" |
| **Auto-Legality Mod** | 自动合法化引擎：从模板/Showdown文本生成合法宝可梦 |
| **Advanced Search** | 多条件全存档搜索，保存筛选器 |
| **One-Touch Evolve** | 一键进化 (含分支选择) |
| **Showdown Import/Export** | Showdown格式导入导出 |
| **Damage Calculator** | 伤害计算器 (PKMDS-Blazor 原创功能，PKHeX没有) |
| **Living Dex Builder** | 全图鉴生成器 |

### 6.2 PKHeX 有但 PKMDS-Blazor 也未实现的工具

| 工具 | 复杂度 | 说明 |
|------|--------|------|
| RNG Tools | 极高 | RNG种子查找、帧推进计算、闪光预测 |
| Event Flags Editor | 高 | 事件旗标/Work值编辑 (高风险: 可能导致存档损坏) |
| Block Data Viewer | 高 | 原始数据块查看/编辑/导入导出 |
| Gen3-9 全套世代专属编辑器 | 高 | 详见第5章 |
| QR Code Support | 中 | QR码生成/扫描 |

---

## 七、优先级排序与实施建议

### 🔴 优先级 P0 (立即实现 — pkmanager 严重缺失的基础编辑功能)

这些是 PKHeX 编辑器的核心字段，缺失导致编辑体验不完整：

| # | 功能 | 涉及字段数 |
|---|------|----------|
| 1 | **相遇信息 Tab 完善** | Met Ball, Origin Game, Met Date, Egg Location, Egg Date, Fateful Encounter |
| 2 | **能力值 Tab 完善** | Calculated Stats, Hidden Power, Stats Chart |
| 3 | **招式 Tab 完善** | PP/PP Ups, Relearn Moves (Gen6+), Move Type/Category Icons |
| 4 | **训练家信息完善** | HT Name/Gender, OT/HT Memory (Gen6+), Affection, Geo Locations |
| 5 | **Main Tab 补全** | Form/FormArg, Language, EXP, Pokérus, Friendship, PID Generator, EC |

### 🔴 优先级 P1 (短期 — 差异化核心体验)

| # | 功能 | 理由 |
|---|------|------|
| 6 | **三态合法性体系 + 逐字段指示器** | PKMDS-Blazor 已验证的 UX 最佳实践 |
| 7 | **宝可梦银行（已有基础，需增强）** | pkmanager 的 PostgreSQL 相比客户端 IndexedDB 有巨大优势 |
| 8 | **全部箱子弹窗 + 箱子管理增强** | 管理32个箱子的必备交互 |
| 9 | **缎带/奖章编辑器** | PKHeX 的核心功能，体现编辑完整性 |
| 10 | **形态/外观可视化编辑** | 多形态宝可梦的视觉化编辑 |

### 🟡 优先级 P2 (中期 — 缩小功能差距)

| # | 功能 |
|---|------|
| 11 | 背包/道具编辑 (Bag Editor) |
| 12 | Encounter Database + 生成合法宝可梦 |
| 13 | 批量编辑器 (Batch Editor) |
| 14 | 一键进化 (One-Touch Evolve) |
| 15 | 图鉴管理 (Pokédex Editor) |
| 16 | 训练家完整信息 (货币/徽章/游戏时间/语言) |
| 17 | Cosmetic Tab (标记/选美/病毒/体型/来源标记) |
| 18 | Showdown 导入导出 |
| 19 | 高级搜索 + 筛选器保存 |

### 🟢 优先级 P3 (长期 — 锦上添花)

| # | 功能 |
|---|------|
| 20 | Gen3-7 世代专属编辑器 (Secret Base/Underground/Festival Plaza等) |
| 21 | Mystery Gift Database |
| 22 | Records/Hall of Fame 管理 |
| 23 | 存档文件诊断与修复 |
| 24 | 跨存档交换 (Trade Tab) |
| 25 | 备份管理系统 |
| 26 | 伤害计算器 |

### ⚫ 优先级 P4 (暂不实现 — 风险高或ROI低)

| # | 功能 |
|---|------|
| 27 | Event Flags/Work 编辑器 (高风险存档损坏) |
| 28 | Block Data Viewer (仅高级用户) |
| 29 | RNG Tools (需深度集成，桌面版也不完善) |
| 30 | QR Code Support |

---

## 附录 A: pkmanager 编辑字段覆盖统计

| PKHeX 编辑器区域 | 总字段数 (约) | pkmanager 已支持 | 覆盖率 |
|-----------------|-------------|-----------------|--------|
| Main Tab | 25 | 9 | 36% |
| Stats Tab | 35 | 12 | 34% |
| Moves Tab | 20 | 4 | 20% |
| Met Tab | 15 | 2 | 13% |
| OT/Misc Tab | 20 | 3 | 15% |
| Cosmetic Tab | 15 | 0 | 0% |
| Ribbons Tab | 100+ | 0 | 0% |
| **PKM Editor 合计** | **~230** | **~30** | **~13%** |
| SAV Editor (存档级) | ~50个子工具 | 0 | 0% |

---

## 附录 B: PKM Editor 逐个字段实现对照表

详细的逐字段清单，建议作为开发任务拆分的依据。

### B.1 Main Tab 字段清单

```
✅ Species           ✅ Nickname          ⚠️ Gender (缺锁定提示)
✅ Level             ✅ Nature            ⚠️ Ability (缺3槽位选择)
✅ Held Item         ✅ Ball              ✅ Is Shiny
⚠️ Is Egg (缺蛋孵化步数)  ✅ Form (待添加)   ❌ Form Argument
❌ Language           ❌ EXP               ❌ Friendship (0-255)
❌ Pokérus Strain     ❌ Pokérus Days      ❌ Fateful Encounter
❌ PID Generator      ❌ EC Generator      ❌ Shiny Type (Star/Square)
❌ Height             ❌ Weight            ❌ Scale
```

### B.2 Stats Tab 字段清单

```
✅ IVs (HP/ATK/DEF/SPA/SPD/SPE)    ✅ EVs (HP/ATK/DEF/SPA/SPD/SPE)
❌ Calculated Stats (6)             ❌ AVs (6, LGPE)
❌ GVs (6, LA)                      ❌ CP (LGPE)
❌ Stat Nature (Gen8+)              ❌ Dynamax Level (Gen8 SwSh)
❌ Can Gigantamax                   ❌ Tera Type Original (Gen9 SV)
❌ Tera Type Override (Gen9 SV)     ❌ Is Alpha (LA/ZA)
❌ Is Noble (LA)                    ❌ Hacked Stats (HaX mode)
❌ Hidden Power Type                ❌ Stats Chart (雷达图)
```

### B.3 Moves Tab 字段清单

```
✅ Move 1-4 (仅ID)                 ❌ PP Current (每个招式)
❌ PP Ups (每个招式)                 ❌ Relearn Moves 1-4 (Gen6+)
❌ Move Type Icon                   ❌ Move Category Icon
❌ Move Power/Accuracy/PP Display   ❌ TR Relearn Flags (Gen8+)
❌ Move Shop Purchased/Mastered (LA)❌ Mastered Moves (LA)
❌ Plus Moves (ZA)                  ❌ Alpha Move (LA)
```

### B.4 Met Tab 字段清单

```
✅ Met Location                     ✅ Met Level
❌ Met Ball (已是Main Tab字段)       ❌ Origin Game
❌ Met Date (Gen4+)                 ❌ Egg Location (Gen4+)
❌ Egg Date (Gen4+)                 ❌ Ground Tile (Gen4)
❌ Met Time of Day (Gen2)           ❌ Battle Version (Gen8+)
❌ Obedience Level (Gen9+)          ❌ Fateful Encounter
```

### B.5 OT/Misc Tab 字段清单

```
✅ OT Name                          ✅ TID/SID (16-bit)
❌ Display TID/SID (6-digit, Gen7+) ❌ HT Name (Gen8+)
❌ HT Gender                        ❌ HT Language
❌ OT Memory (Gen6+)                ❌ HT Memory (Gen6+)
❌ Memory Intensity/Feeling/Text    ❌ Affection (Gen6+)
❌ Geo Locations 1-5 (Gen6-7)       ❌ Home Tracker (Gen8+)
❌ Country (IRegionOrigin)          ❌ Sub-Region
❌ Console Region                   ❌ Affixed Ribbon/Mark
❌ Favorite (Gen7b+)                ❌ Handwriting (Gen7)
```

### B.6 Cosmetic Tab 字段清单

```
❌ Markings (●▲■♥★♦)               ❌ Contest Cool/Beauty/Cute/Smart/Tough
❌ Contest Sheen (Gen3-4)           ❌ Pokérus Strain + Days
❌ Height Scalar                    ❌ Weight Scalar
❌ Scale Rating (XS/S/M/L/XL)       ❌ Origin Mark (只读)
❌ Spinda Spots Preview
```

### B.7 Ribbons Tab 字段清单

```
❌ Contest Ribbons (Cool/Beauty/Cute/Smart/Tough × 各4级 = 20枚)
❌ Battle Ribbons (Tower/Tree/Maison等, 约10+枚)
❌ Event Ribbons (Classic/Premier/Event等, 约5+枚)
❌ Memorial Ribbons (约5枚)
❌ Mark Ribbons (Gen8+, 约50+种证章)
❌ Generation-Specific Ribbons (各地独占, 约10+枚)
```

---

> **Sources:**
> - [PKHeX GitHub Repository](https://github.com/kwsch/PKHeX)
> - [PKHeX WinForms Controls](https://github.com/kwsch/PKHeX/tree/master/PKHeX.WinForms/Controls)
> - [PKMDS-Blazor PKHeX Parity Roadmap](https://github.com/codemonkey85/PKMDS-Blazor/blob/main/PKHEX_PARITY_ROADMAP.md)
> - [PKHeX.Core API](https://github.com/kwsch/PKHeX/tree/master/PKHeX.Core)
