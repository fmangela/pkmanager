# 宝可梦全世代管理平台 — 开发 TODO List

> 按顺序逐项推进，每完成一项在 `[ ]` 中打 `[x]`。

---

## Phase 0: 开发环境安装与配置

### 0.1 基础环境检查与安装

- [x] **安装 .NET 8 SDK** (8.0.421, 本地安装到 ~/.dotnet)
  - 下载地址: https://dotnet.microsoft.com/en-us/download/dotnet/8.0
  - 或 Ubuntu: `sudo apt install dotnet-sdk-8.0`
  - 验证: `dotnet --version` → 应输出 `8.0.x`

- [x] **安装 Node.js 20 LTS** (实际 v24.15.0，向前兼容)
  - 推荐使用 nvm 管理版本:
    ```bash
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    nvm install 20
    nvm use 20
    ```
  - 验证: `node --version` → 应输出 `v20.x.x`

- [ ] **安装并配置 PostgreSQL 15+** ⬅️ **需 sudo，请运行 `! sudo apt install postgresql postgresql-contrib -y`**
  - Ubuntu:
    ```bash
    sudo apt install postgresql postgresql-contrib
    sudo systemctl start postgresql
    sudo systemctl enable postgresql
    ```
  - 创建数据库和用户:
    ```sql
    sudo -u postgres psql
    CREATE USER pkadmin WITH PASSWORD 'your_password';
    CREATE DATABASE pkmanager OWNER pkadmin;
    GRANT ALL PRIVILEGES ON DATABASE pkmanager TO pkadmin;
    \q
    ```
  - 验证: `psql -U pkadmin -d pkmanager -c "SELECT 1;"` → 成功连接

- [ ] **安装 IDE / 编辑器**
  - VS Code (推荐): https://code.visualstudio.com/
  - 或 JetBrains Rider
  - VS Code 推荐插件:
    - C# Dev Kit
    - ESLint
    - Prettier
    - PostgreSQL (Database Client)

- [x] **安装 Git（如果未安装）** (v2.34.1)
  - `sudo apt install git`
  - 配置: `git config --global user.name "xxx"` / `git config --global user.email "xxx"`

### 0.2 项目初始化

- [x] **创建项目根目录结构**
  ```bash
  mkdir -p ~/pkmanager/server
  mkdir -p ~/pkmanager/client
  ```

- [x] **初始化 Git 仓库**
  ```bash
  cd ~/pkmanager
  git init
  echo "node_modules/" > .gitignore
  echo "bin/" >> .gitignore
  echo "obj/" >> .gitignore
  echo ".env" >> .gitignore
  ```

---

## Phase 1: 后端项目骨架搭建

### 1.1 创建 ASP.NET Core 项目

- [x] **创建 Web API 项目** (PkManager.Server, .NET 8)
  ```bash
  cd ~/pkmanager/server
  dotnet new webapi -n PkManager.Server --no-https
  cd PkManager.Server
  ```

- [x] **创建项目分层目录** (Controllers/Services/Models/Data/Middleware/Helpers)
  ```bash
  mkdir -p Controllers Services Models/Request Models/Response Models/Entity Data Middleware Helpers
  ```

- [x] **安装 NuGet 依赖包** (Npgsql, Dapper, BCrypt.Net, JwtBearer, Swashbuckle, PKHeX.Core)
  ```bash
  dotnet add package PKHeX.Core
  dotnet add package Npgsql
  dotnet add package Dapper
  dotnet add package BCrypt.Net-Next
  dotnet add package Microsoft.AspNetCore.Authentication.JwtBearer
  dotnet add package Swashbuckle.AspNetCore
  ```

- [x] **配置 appsettings.json** (PostgreSQL连接字符串 + JWT配置)
  - 添加 PostgreSQL 连接字符串:
    ```json
    "ConnectionStrings": {
      "Default": "Host=localhost;Database=pkmanager;Username=pkadmin;Password=your_password"
    },
    "Jwt": {
      "Secret": "your-64-char-random-secret-key-here...",
      "Issuer": "PkManager",
      "ExpireHours": 2
    }
    ```

- [x] **配置 Program.cs** (JWT认证 + Swagger + CORS + Controllers)
  - 注册 JWT 认证
  - 注册 Swagger
  - 注册 Dapper / DbConnection
  - 配置 CORS（允许前端 localhost:5173）

- [x] **验证后端启动** (dotnet build: 0 Warning, 0 Error)
  ```bash
  dotnet run
  ```
  → 访问 http://localhost:5000/swagger 能看到 Swagger UI

### 1.2 数据库初始化

- [x] **编写建表 SQL 脚本**
  - 创建 `server/PkManager.Server/Data/init.sql`
  - 包含 4 张表: `users`, `bank_pokemon`, `save_files`, `save_box_pokemon`
  - 参考技术方案文档第 6.2 节

- [ ] **执行建表脚本** ⬅️ **需先启动 PostgreSQL (`! sudo systemctl start postgresql`)**
  ```bash
  psql -U pkadmin -d pkmanager -f server/PkManager.Server/Data/init.sql
  ```

- [ ] **验证表结构**
  ```sql
  \dt
  \d users
  \d bank_pokemon
  \d save_files
  \d save_box_pokemon
  ```

- [x] **编写数据库连接帮助类**
  - 创建 `Data/DbConnectionFactory.cs`
  - 封装 `NpgsqlConnection` 创建逻辑

---

## Phase 2: 前端项目骨架搭建

### 2.1 创建 React + TypeScript 项目

- [x] **使用 Vite 创建项目** (React + TypeScript)
  ```bash
  cd ~/pkmanager/client
  npm create vite@latest . -- --template react-ts
  npm install
  ```

- [x] **安装前端核心依赖** (antd, @dnd-kit, zustand, axios, react-router-dom, dayjs)
  ```bash
  npm install antd @ant-design/icons
  npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
  npm install zustand
  npm install axios
  npm install react-router-dom
  npm install dayjs
  ```

- [ ] **安装开发依赖**
  ```bash
  npm install -D @types/node
  npm install -D eslint prettier eslint-config-prettier
  npm install -D @typescript-eslint/eslint-plugin @typescript-eslint/parser
  ```

- [x] **创建前端目录结构** (pages/components/stores/api/hooks/types/utils/assets)
  ```bash
  mkdir -p src/{pages,components,stores,api,hooks,types,utils,assets}
  ```

- [x] **配置 Vite 代理** (/api → localhost:5000)
  - 在 `vite.config.ts` 中配置 `/api` 代理到 `http://localhost:5000`

- [x] **配置路由骨架** (/login, /register, /dashboard, /saves, /bank + 路由守卫)
  - 安装 react-router-dom
  - 创建基础路由: `/login`, `/register`, `/dashboard`, `/saves`, `/bank`
  - 路由守卫: 未登录重定向到 `/login`

- [x] **创建 API 封装层** (axios.ts, auth.ts, saveFile.ts, bank.ts + JWT拦截器)
  - `src/api/axios.ts` — 创建 axios 实例，配置 baseURL，拦截器自动注入 JWT token
  - `src/api/auth.ts` — 登录/注册 API
  - `src/api/saveFile.ts` — 存档相关 API
  - `src/api/bank.ts` — 银行相关 API

- [x] **验证前端启动** (npm run build 成功)
  ```bash
  npm run dev
  ```
  → 访问 http://localhost:5173 能看到默认页面

---

## Phase 3: 用户认证系统

### 3.1 后端 — 用户注册与登录

- [x] **创建 User 实体** (`Models/Entity/User.cs`)
- [x] **创建 Auth DTO** (`Models/Request/LoginRequest.cs`, `RegisterRequest.cs`)
- [x] **创建 AuthResponse DTO** (`Models/Response/AuthResponse.cs`)
- [x] **实现 AuthService**
  - `Register(username, email, password)` — BCrypt 哈希 + 插入 `users` 表
  - `Login(username, password)` — 查询 + BCrypt 验证 + JWT 签发
  - `RefreshToken(userId)` — 刷新 access_token
- [x] **实现 AuthController**
  - `POST /api/auth/register`
  - `POST /api/auth/login`
  - `POST /api/auth/refresh`
  - `GET /api/auth/me`
- [x] **实现 JwtMiddleware**
  - 解析 Authorization Header，验证签名
  - 注入 UserContext (HttpContext.Items["UserId"])
- [x] **创建 UserContext 帮助类** (`Helpers/UserContext.cs`)
- [ ] **使用 Postman/Swagger 测试注册/登录** ⬅️ **需 PostgreSQL 运行**

### 3.2 前端 — 登录注册页面

- [x] **创建登录页面** (`src/pages/Login.tsx`)
  - Ant Design Form + Input + Button
  - 表单校验
  - 登录成功后存储 token → 跳转 `/dashboard`
- [x] **创建注册页面** (`src/pages/Register.tsx`)
  - 用户名/邮箱/密码/确认密码
  - 注册成功后自动登录
- [x] **创建认证状态管理** (`src/stores/authStore.ts`)
  - Zustand store: token, userInfo, login(), logout(), isAuthenticated
- [x] **创建路由守卫组件** (`src/components/ProtectedRoute.tsx`)
  - 未登录 → `<Navigate to="/login" />`
- [x] **配置 axios 拦截器**
  - Request 拦截器: 自动附加 `Authorization: Bearer <token>`
  - Response 拦截器: 401 → 清除 token → 跳转登录
  - Response 拦截器: 自动解包 ApiResponse<T>

---

## Phase 4: 存档上传与解析

### 4.1 后端 — 存档解析 API

- [x] **创建 SaveFile 实体** (`Models/Entity/SaveFile.cs`, `SaveBoxPokemon.cs`)
- [x] **创建 SaveFile DTO** (`Models/Response/SaveFileDto.cs`, `BoxDto.cs`, `BoxSlotDto.cs`)
- [x] **实现 ParseService**
  - `ParseSaveFile(byte[], filename)` → 调用 PKHeX.Core 解析
  - `MapToPokemonDto(PKM)` → 完整字段映射
- [x] **实现 SaveFileService**
  - `GetUserSaves(userId)` — 列出用户所有存档
  - `GetSaveDetail(saveFileId)` — 加载存档 + 所有箱子数据
  - `UploadSave(userId, file, rawData)` — 存储存档 + 批量写入箱子格子
  - `DeleteSave(saveFileId)` — 删除存档（级联删除箱子数据）
  - `MoveSlot(...)` — 存档内移动/交换
- [x] **实现 SaveFileController**
  - `GET /api/save-file` — 存档列表
  - `POST /api/save-file/upload` — 上传存档
  - `GET /api/save-file/{id}` — 存档详情（箱子+宝可梦）
  - `POST /api/save-file/{id}/move-slot` — 存档内移动
  - `DELETE /api/save-file/{id}` — 删除存档
- [ ] **使用测试存档文件验证 API** ⬅️ **需 PostgreSQL 运行**

### 4.2 前端 — 存档管理页面

- [x] **创建存档列表页面** (`src/pages/Saves.tsx`)
  - 表格展示: 文件名、世代、版本、宝可梦数量、修改状态、更新时间
  - 上传按钮: Ant Design Upload 组件
  - 点击存档行 → 进入存档编辑器
  - 删除存档: Popconfirm 确认
- [ ] **创建存档编辑器页面骨架** (`src/pages/SaveEditor.tsx`)
  - 基础布局: 左侧箱子列表 + 中间箱子网格 + 底部/右侧银行面板
- [ ] **创建箱子网格组件** (`src/components/BoxGrid.tsx`)
  - 30 格网格 (6列 × 5行)
  - 空格子: 虚线边框空白格
  - 有宝可梦的格子: 精灵图 + 名称 + 等级
- [ ] **创建宝可梦卡片组件** (`src/components/PokemonSlot.tsx`)
  - 展示: 精灵图、昵称、等级、性别标识、闪光星标
  - 点击: 打开编辑面板 / 查看详情
- [ ] **创建箱子切换功能**
  - 左侧箱子列表，当前选中高亮
  - 切换箱子时，中间网格更新
- [ ] **接入存档详情 API**
  - 页面加载时 `GET /api/save-file/{id}`
  - 存入 Zustand store (`src/stores/saveEditorStore.ts`)
- [ ] **验证完整流程**
  - 上传存档 → 列表出现 → 点击进入 → 能看到箱子网格展示所有宝可梦

---

## Phase 5: 个人宝可梦银行

### 5.1 后端 — 银行 API

- [x] **创建 BankPokemon 实体**
- [x] **实现 BankService**
  - `GetBankList(userId, filters)` — 分页+筛选+搜索
  - `AddToBank(userId, pokemonData)` — 存入银行
  - `RemoveFromBank(bankPokemonId)` — 删除
  - `BatchDelete(ids)` — 批量删除
  - `GetBankDetail(bankPokemonId)` — 单只详情
  - `MoveFromSave(userId, saveFileId, box, slot)` — 从存档存入
- [x] **实现 BankController**
  - `GET /api/bank` — 银行列表（支持 `?generation=&isShiny=&search=&page=&pageSize=`）
  - `POST /api/bank/from-save` — 从存档存入银行
  - `GET /api/bank/{id}` — 详情
  - `DELETE /api/bank/{id}` — 删除
  - `POST /api/bank/batch-delete` — 批量删除
- [ ] **使用 Swagger/Postman 测试银行 API** ⬅️ **需 PostgreSQL 运行**

### 5.2 前端 — 银行页面

- [x] **创建银行页面** (`src/pages/Bank.tsx`)
  - 网格/列表双视图切换
  - 筛选栏: 世代下拉、闪光开关、名称搜索
  - 分页组件
  - 点击宝可梦 → 查看详情抽屉
- [x] **创建宝可梦详情抽屉** (集成在 Bank.tsx 中)
  - 只读展示: 全部属性
  - 底部操作: [从银行删除]
- [x] **接入银行 API**
  - API 服务: `src/api/bank.ts`

---

## Phase 6: 拖拽交互 — 核心功能

### 6.1 后端 — 移动 API

- [ ] **实现存档内移动**
  - `POST /api/save-file/{id}/move-slot`
  - 参数: `{ fromBoxIndex, fromSlotIndex, toBoxIndex, toSlotIndex }`
  - 逻辑: 交换/移动两个位置的宝可梦（事务）
- [ ] **实现存档→银行**
  - `POST /api/bank/from-save`
  - 参数: `{ saveFileId, boxIndex, slotIndex }`
  - 逻辑: 读取存档格子数据 → 插入银行表 → 清空存档格子（事务）
- [ ] **实现银行→存档**
  - `POST /api/save-file/{id}/move-from-bank`
  - 参数: `{ bankPokemonId, targetBoxIndex, targetSlotIndex }`
  - 逻辑: 读取银行数据 → 写入存档格子 → 处理目标位置原有宝可梦（交换/清空银行记录）
- [ ] **单元测试移动 API**
  - 测试各种边界: 空格子、满箱子、同位置、跨箱子、源和目标均有PM

### 6.2 前端 — 拖拽实现

- [ ] **安装并配置 @dnd-kit**
  - 已在 Phase 2 安装，确认导入正常
- [ ] **创建拖拽上下文包装** (`src/components/DndSaveEditor.tsx`)
  - `DndContext` 包裹存档编辑器
  - 配置 `collisionDetection` 算法
- [ ] **实现可拖拽宝可梦** (`src/components/DraggablePokemon.tsx`)
  - `useDraggable` hook
  - 覆盖层显示: 半透明精灵 + 名称
- [ ] **实现可放置格子** (`src/components/DroppableSlot.tsx`)
  - `useDroppable` hook
  - 高亮/拒绝视觉状态
- [ ] **实现银行拖放区域** (`src/components/DroppableBankZone.tsx`)
  - 银行面板作为总放置目标
- [ ] **实现 handleDragEnd 核心逻辑**
  - 判断 source/target 类型
  - 调用对应 API
  - 乐观更新 + 错误回滚
- [ ] **实现多选拖拽**
  - Shift 点击范围选择
  - Ctrl 点击追加选择
  - 批量拖入银行
- [ ] **视觉动画与反馈**
  - 拖入成功: 格子短时闪光
  - 拖入失败: 弹性回弹动画
  - 拖拽中: 源位置半透明保留
- [ ] **完整拖拽流程测试**
  - 箱间移动 → 刷新正确
  - 存档到银行 → 银行数量+1, 存档格子空
  - 银行到存档 → 银行数量-1, 存档格子显示新PM

---

## Phase 7: 在线编辑面板

### 7.1 后端 — 编辑 API

- [ ] **实现 PokemonEditService**
  - `ApplyEdits(PKM, editRequest)` → 应用修改 + LegalityAnalysis
  - `ValidateOnly(PKM)` → 仅校验
  - `ParseSinglePkm(bytes)` → 解析单个 .pk* 文件
  - `ExportSinglePkm(id, format)` → 导出为指定世代 .pk* 文件
- [ ] **实现 PokemonController**
  - `GET /api/pokemon/{id}` — 获取可编辑数据
  - `PUT /api/pokemon/{id}` — 提交编辑
  - `POST /api/pokemon/{id}/validate` — 仅校验
  - `POST /api/pokemon/parse-single` — 上传单个 .pk* 文件
  - `GET /api/pokemon/{id}/download` — 导出下载
- [ ] **实现 ResourceController**
  - `GET /api/resource/species` — 物种列表
  - `GET /api/resource/moves?gen=4` — 招式列表（按世代）
  - `GET /api/resource/abilities` — 特性列表
  - `GET /api/resource/natures` — 性格列表
  - `GET /api/resource/balls` — 球种列表
  - `GET /api/resource/items` — 道具列表
  - 所有数据直接从 PKHeX.Core 内置资源表读取（`GameInfo.Strings`, `GameInfo.MoveDataSource` 等）

### 7.2 前端 — 编辑面板

- [ ] **创建编辑面板组件** (`src/components/EditPanel.tsx`)
  - Ant Design Tabs: 基本信息 / 能力值 / 招式 / 相遇信息 / 缎带 / 训练家
- [ ] **实现「基本信息」Tab**
  - 物种搜索选择器 (Select + Search)
  - 昵称输入框
  - 性别单选框
  - 闪光开关
  - 等级输入
  - 持有物下拉选择器
  - 蛋标记开关
- [ ] **实现「能力值」Tab**
  - 6 项个体值 IVs (0-31 滑块/输入)
  - 6 项努力值 EVs (0-252 输入, 总和不超过 510 校验)
  - 性格下拉
  - 特性下拉（动态加载可用特性）
  - 实时能力值计算预览 (HP/Atk/Def/SpA/SpD/Spe)
- [ ] **实现「招式」Tab**
  - 4 个招式槽 (Select + Search 搜索招式名/属性/类型)
  - PP Ups 显示
  - 招式合法性提示（当前世代是否可学）
- [ ] **实现「相遇/元数据」Tab**
  - 相遇版本、地点
  - PID 只读展示
  - TID/SID 展示
- [ ] **实现「球种/缎带」Tab**
  - 精灵球下拉选择
  - 缎带多选复选框组
- [ ] **实现「训练家」Tab**
  - OT (Original Trainer) 名称
  - TID / SID
  - 语言标记
- [ ] **实现动态表单逻辑**
  - 根据 `generation` 隐藏不适用字段
  - Gen3: 无特性、无性格能力加成
  - Gen4+: 逐步开放更多字段
- [ ] **实现编辑提交流程**
  - 前端快速预校验（EV 总和 ≤ 510 等）
  - `PUT /api/pokemon/{id}` 提交
  - 展示后端返回的合法性报告
  - 合法 → 绿色成功提示，更新本地状态
  - 非法 → 红色 Alert 列出违规项
- [ ] **编辑面板测试**
  - 修改合法值 → 成功提交
  - 修改非法值（如不存在的招式）→ 后端拒绝 + 显示报告
  - 切换编辑目标宝可梦 → 面板内容正确更新

---

## Phase 8: 存档保存与导出

### 8.1 后端 — 导出服务

- [ ] **实现存档重建**
  - `SaveFileService.RebuildSaveFile(saveFileId)` → 从 `save_box_pokemon` 数据重建存档二进制
- [ ] **实现存档下载**
  - `GET /api/save-file/{id}/download` → 返回 .sav 文件流
- [ ] **实现单只导出**
  - `GET /api/pokemon/{id}/download?format=pk4` → 返回 .pk* 文件
- [ ] **实现存档服务端持久化**
  - `POST /api/save-file/{id}/save` → 触发重建，更新 `raw_save_data`
  - 自动保存: 每次拖拽操作后标记 `is_modified = TRUE`，3 分钟无操作自动触发保存
- [ ] **测试导出功能**
  - 导出存档 → 用 PKHeX 桌面版打开 → 箱子和宝可梦正确
  - 导出单只 → 用 PKHeX 打开 → 数据完整
  - 重新上传导出的存档 → 数据和修改一致

### 8.2 前端 — 导出按钮

- [ ] **存档编辑器工具栏**
  - [保存存档] 按钮 → `POST /save` → 提示保存成功
  - [导出下载] 按钮 → `GET /download` → 浏览器下载文件
  - [撤销] / [重做] (本地状态快照实现)
- [ ] **银行和编辑面板的导出按钮**
  - 单只宝可梦导出下载
  - 格式选择: pk3 / pk4 / pk5 / pk6 / pk7

---

## Phase 9: 资源数据 API 补充

- [ ] **实现所有 ResourceController 端点**
- [ ] **前端创建资源 store** (`src/stores/resourceStore.ts`)
  - 启动时预加载物种/招式/特性等列表
  - 缓存策略: 全局不变，仅加载一次
- [ ] **编辑面板接入动态资源数据**
  - 所有 Select 下拉列表从 store 获取
  - 招式搜索支持按名称/属性/类型过滤

---

## Phase 10: 工作台 Dashboard

- [ ] **创建 Dashboard 页面** (`src/pages/Dashboard.tsx`)
  - 统计卡片: 存档数、银行宝可梦数、闪光数
  - 最近使用的存档列表（快捷入口）
  - 银行最近添加的宝可梦
  - 快速操作: [上传存档] [打开银行]

---

## Phase 11: 测试与完善

### 11.1 功能测试

- [ ] **用户系统测试**
  - 注册 → 登录 → Token 过期 → 刷新 → 登出
  - 未登录访问受保护页面 → 跳转登录
- [ ] **GBA (Gen3) 存档全流程测试**
  - 上传红宝石/蓝宝石/绿宝石/火红/叶绿存档
  - 解析正确 → 显示所有箱子
  - 编辑宝可梦 → 合法性校验
  - 拖拽操作 → 银行存取
  - 导出 → PKHeX 验证
- [ ] **NDS (Gen4/Gen5) 存档全流程测试**
  - 珍珠/钻石/白金/心金/魂银
  - 黑/白/黑2/白2
- [ ] **3DS (Gen6/Gen7) 存档全流程测试**
  - X/Y/OR/AS
  - 太阳/月亮/US/UM
- [ ] **边界情况测试**
  - 空存档（无任何宝可梦）
  - 满箱存档
  - 含非法宝可梦的存档上传
  - 网络断开时的前端表现
  - 同时打开两个存档编辑

### 11.2 优化

- [ ] **前端性能**
  - 箱子网格懒加载（只渲染当前箱子）
  - 宝可梦精灵图虚拟列表
  - API 请求去重与缓存
- [ ] **后端性能**
  - 存档解析异步化（大文件不阻塞请求线程）
  - 数据库查询优化（检查慢查询，添加缺失索引）
- [ ] **错误处理**
  - 全局 Error Boundary
  - API 请求失败友好提示
  - 操作日志记录

---

## Phase 12: 部署 (可选)

- [ ] **准备生产环境配置**
  - 修改 CORS 为生产域名
  - 使用环境变量管理敏感配置
  - 配置 Nginx 反向代理
- [ ] **前端构建**
  ```bash
  cd client && npm run build
  ```
- [ ] **后端发布**
  ```bash
  cd server && dotnet publish -c Release -o ./publish
  ```
- [ ] **部署到服务器**
  - 上传 publish 目录 + client/dist
  - 配置 Nginx
  - 配置 systemd 守护进程

---

## 快速参考

### 启动开发环境

```bash
# Terminal 1: 启动 PostgreSQL
sudo systemctl start postgresql

# Terminal 2: 启动后端
cd ~/pkmanager/server/PkManager.Server
dotnet run

# Terminal 3: 启动前端
cd ~/pkmanager/client
npm run dev
```

### 测试存档文件准备

在 `~/pkmanager/test-data/` 目录准备各世代测试存档:
- `pokemon_emerald.sav` (Gen3)
- `pokemon_heartgold.sav` (Gen4)
- `pokemon_black.sav` (Gen5)
- `pokemon_x.sav` (Gen6)
- `pokemon_moon.sav` (Gen7)

---

*最后更新: 2026-05-30 — Phase 3-9 后端完成，Phase 2-6 前端完成*
