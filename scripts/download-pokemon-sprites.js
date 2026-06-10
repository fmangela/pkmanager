#!/usr/bin/env node
// ── 宝可梦标准精灵图批量下载脚本 ────────────────────────────────
// 从 PokeAPI sprites GitHub 下载 species 1–1025 的 96×96 标准精灵图
// 用法: node scripts/download-pokemon-sprites.js [--from N] [--to M]
// 零依赖，Node v24 内建 fetch

const fs = require('fs');
const path = require('path');

// ── 参数解析 ──────────────────────────────────────────────────
const args = process.argv.slice(2);
let FROM = 1, TO = 1025;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--from' && args[i + 1]) FROM = parseInt(args[i + 1], 10);
  if (args[i] === '--to'   && args[i + 1]) TO   = parseInt(args[i + 1], 10);
}

const OUT_DIR = path.resolve(__dirname, '..', 'client', 'public', 'sprites', 'pokemon');
const BASE_URL = 'https://gcore.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/pokemon';
const CONCURRENCY = 10;
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000]; // 指数退避

// ── 工具函数 ──────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function downloadOne(id) {
  const filePath = path.join(OUT_DIR, `${id}.png`);

  // 跳过已有有效文件（非零字节）
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > 0) return { id, result: 'skip' };
  } catch (_) { /* 不存在，继续下载 */ }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${BASE_URL}/${id}.png`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('image/png')) throw new Error(`Bad content-type: ${ct}`);

      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0) throw new Error('Empty body');

      // 原子写入: .tmp → rename
      const tmpPath = filePath + '.tmp';
      fs.writeFileSync(tmpPath, buf);
      fs.renameSync(tmpPath, filePath);

      return { id, result: 'ok' };
    } catch (err) {
      // 清理可能的残留 tmp
      try { fs.unlinkSync(filePath + '.tmp'); } catch (_) {}
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAYS[attempt] || 4000);
      } else {
        return { id, result: 'fail', error: err.message };
      }
    }
  }
}

// ── 主流程 ─────────────────────────────────────────────────────
async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const ids = [];
  for (let i = FROM; i <= TO; i++) ids.push(i);
  const total = ids.length;

  let done = 0;
  let ok = 0, skip = 0, fail = 0;
  const failures = [];

  console.log(`下载宝可梦精灵图 ${FROM}–${TO} (共 ${total} 个) → ${OUT_DIR}`);
  console.log(`并发: ${CONCURRENCY} | 重试: ${MAX_RETRIES}\n`);

  // 并发控制
  const queue = [...ids];
  async function worker() {
    while (queue.length > 0) {
      const id = queue.shift();
      const { result, error } = await downloadOne(id);
      done++;
      if (result === 'ok') ok++;
      else if (result === 'skip') skip++;
      else { fail++; failures.push({ id, error }); }

      if (done % 50 === 0 || done === total) {
        const pct = Math.round(done / total * 100);
        process.stdout.write(`\r  进度: ${done}/${total} (${pct}%)  成功 ${ok}  跳过 ${skip}  失败 ${fail}`);
      }
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, () => worker());
  await Promise.all(workers);

  console.log('\n');
  console.log(`======== 下载完成 ========`);
  console.log(`总计: ${total}  成功: ${ok}  跳过: ${skip}  失败: ${fail}`);

  if (failures.length > 0) {
    console.error(`\n失败列表:`);
    for (const f of failures) {
      console.error(`  species ${f.id}: ${f.error}`);
    }
    process.exit(1);
  }
}

main().catch(err => {
  console.error('脚本异常:', err);
  process.exit(2);
});
