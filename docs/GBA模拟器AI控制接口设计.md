# GBA 模拟器外部控制接口

> **日期**: 2026-06-06
> **目标**: 让外部脚本（Python、Node.js、AI Agent）能通过 HTTP 操控浏览器中的 GBA 模拟器，实现自动化游玩、测试、数据采集。
> **原理**: mGBA WASM 运行在浏览器 Canvas 中，所有底层能力（按键、截图、存档）已具备。在此之上封装控制接口。

---

## 1. 架构

```
AI/Script (Python, etc.)
    │
    ├─ POST /api/Emulator/control/send    发送命令
    ├─ GET  /api/Emulator/control/poll     获取结果
    │
    ▼
Backend (内存命令队列)
    │
    │ 浏览器轮询 pending commands
    ▼
Browser (mGBA WASM)
    │
    ├─ buttonPress("A"), screenshot(), saveState(1) ...
    └─ 结果回传 POST /api/Emulator/control/result
```

---

## 2. 命令列表

所有命令通过 `{ action, params?, id? }` JSON 发送。

### 2.1 按键

| action | params | 说明 |
|--------|--------|------|
| `press` | `{ button: "A" }` | 按下按键（保持） |
| `release` | `{ button: "A" }` | 释放按键 |
| `tap` | `{ button: "A", duration?: 100 }` | 按下 duration 毫秒后释放（默认100ms） |
| `sequence` | `{ buttons: [{button, duration}] }` | 连续按键序列 |

可用按键: `A`, `B`, `L`, `R`, `Start`, `Select`, `Up`, `Down`, `Left`, `Right`

### 2.2 屏幕

| action | params | 返回 |
|--------|--------|------|
| `screenshot` | `{ format?: "png" \| "raw" }` | base64 PNG 或原始 RGBA 像素数组 |
| `getPixel` | `{ x: number, y: number }` | `{ r, g, b, a }` |

### 2.3 存档

| action | params | 说明 |
|--------|--------|------|
| `saveState` | `{ slot: 1-9 }` | 即时存档到槽位 |
| `loadState` | `{ slot: 1-9 }` | 从槽位加载即时存档 |
| `getSave` | — | 获取游戏内 .sav 存档数据（base64） |

### 2.4 速度

| action | params | 说明 |
|--------|--------|------|
| `setSpeed` | `{ multiplier: number }` | 1=正常, 2=2倍, 4=4倍 |
| `pause` | — | 暂停 |
| `resume` | — | 继续 |

### 2.5 重置

| action | params | 说明 |
|--------|--------|------|
| `reset` | — | 快速重置（quickReload） |

### 2.6 批量

| action | params | 说明 |
|--------|--------|------|
| `batch` | `{ commands: Command[] }` | 顺序执行多个命令，返回每个结果 |

---

## 3. HTTP API

### 发送命令

```
POST /api/Emulator/control/send
Body: { saveFileId, action, params, id? }

Response: { accepted: true, commandId }
```

### 轮询结果

```
GET /api/Emulator/control/poll/{saveFileId}

Response: {
  pending: [{ commandId, action, params }],
  results: [{ commandId, action, ok, data?, error?, elapsedMs }]
}
```

### 提交结果（浏览器端）

```
POST /api/Emulator/control/result
Body: { saveFileId, commandId, ok, data?, error?, elapsedMs }
```

### 一键流程

```
POST /api/Emulator/control/execute
Body: { saveFileId, action, params, timeout?: 10000 }

同步等待结果返回（阻塞 HTTP 请求直到超时或浏览器完成）
Response: { ok, data?, error?, elapsedMs }
```

---

## 4. 浏览器端 API（JavaScript）

### 4.1 `gbaControl.ts` 接口

```typescript
interface GBAController {
  // 按键
  press(button: GBAButton): void;
  release(button: GBAButton): void;
  tap(button: GBAButton, durationMs?: number): Promise<void>;
  sequence(buttons: Array<{button: GBAButton, duration: number}>): Promise<void>;

  // 屏幕
  screenshot(format?: 'png' | 'raw'): Promise<string | Uint8ClampedArray>;
  getPixel(x: number, y: number): { r: number, g: number, b: number, a: number };

  // 存档
  saveState(slot: number): boolean;
  loadState(slot: number): boolean;
  getSave(): string | null;  // base64

  // 速度
  setSpeed(multiplier: number): void;
  pause(): void;
  resume(): void;
  reset(): void;

  // 命令队列（与后端桥接）
  processCommand(cmd: Command): Promise<CommandResult>;
}
```

### 4.2 使用示例

```javascript
// 浏览器 Console 中直接使用
const gba = window.__gbaController;

// 按 A 键 100ms
await gba.tap('A', 100);

// 截图
const pngBase64 = await gba.screenshot('png');

// 连续操作: 按 A → 等 500ms → 按下键 → 等 200ms → 截图
await gba.sequence([
  { button: 'A', duration: 500 },
  { button: 'Down', duration: 200 },
]);
const screen = await gba.screenshot('png');
```

---

## 5. Python 客户端示例

```python
import requests, time, base64

API = "http://localhost:5000/api/Emulator/control"
SAVE_ID = "42791c52-a302-4ea8-97af-ca1797a05b16"

def cmd(action, params=None, timeout=10):
    r = requests.post(f"{API}/execute", json={
        "saveFileId": SAVE_ID,
        "action": action,
        "params": params or {}
    }, timeout=timeout)
    return r.json()

# 按 A 进入游戏
cmd("tap", {"button": "A", "duration": 500})

# 等待加载
time.sleep(2)

# 截图
result = cmd("screenshot", {"format": "png"})
with open("screen.png", "wb") as f:
    f.write(base64.b64decode(result["data"]))

# 加速到 4 倍
cmd("setSpeed", {"multiplier": 4})

# 存档
cmd("saveState", {"slot": 1})

print("Done!")
```

---

## 6. 能力矩阵

| 能力 | 当前状态 | 实现方式 |
|------|---------|---------|
| 按键输入 | ✅ 可用 | `buttonPress`/`buttonUnpress` |
| 连续按键 | ✅ 可用 | `tap` + `sequence` 封装 |
| 截图 (PNG) | ✅ 可用 | Canvas → `toDataURL()` |
| 截图 (原始像素) | ✅ 可用 | `getImageData(0,0,240,160)` |
| 即时存档 | ✅ 可用 | `saveState(slot)` / `loadState(slot)` |
| 游戏内存档 (.sav) | ✅ 可用 | `getSave()` → base64 |
| 速度控制 | ✅ 可用 | `setFastForwardMultiplier` |
| 暂停/继续 | ✅ 可用 | `pauseGame` / `resumeGame` |
| 重置 | ✅ 可用 | `quickReload` |
| **GBA 内存读取** | ❌ 需 WASM 重编译 | 需在 mGBA C 源码加 `readMemory` 导出 |
| **GBA 内存写入** | ❌ 需 WASM 重编译 | 同上 |

---

## 7. 后续扩展

- **GBA 内存读写**：重新编译 mGBA WASM，添加 `mgba_read_memory` / `mgba_write_memory` C 函数导出
- **Pokémon 数据接口**：基于内存读写封装高级 API（读取队伍、背包、当前地图等）
- **WebSocket 实时流**：推送屏幕帧 + 音频到后端
- **录制回放**：保存按键序列 + 截图，可重播
