import React, { useEffect, useRef, useState } from 'react';
import { InputNumber, Tag, Space } from 'antd';
import type { PokemonDto } from '../../api/saveFile';

interface Props {
  pokemon: PokemonDto;
  generation: number;
  onChange?: () => void;
}

const MARK_SYMBOLS = ['●', '▲', '■', '♥', '★', '♦'];

const ORIGIN_MARK_MAP: Record<number, { label: string; color: string }> = {
  0: { label: '无', color: '#d9d9d9' },
  1: { label: 'Game Boy', color: '#5b8c5a' },
  2: { label: 'GO', color: '#5b9bd5' },
  3: { label: '五角形 (Gen6)', color: '#1890ff' },
  4: { label: '三叶草 (Gen7)', color: '#eb2f96' },
  5: { label: '伽勒尔 (Gen8 SWSH)', color: '#722ed1' },
  6: { label: 'Trio (Gen8 BDSP)', color: '#fa8c16' },
  7: { label: '洗翠 (Gen8 LA)', color: '#13c2c2' },
  8: { label: '帕底亚 (Gen9 SV)', color: '#f5222d' },
};

const CosmeticTab: React.FC<Props> = ({ pokemon, generation, onChange }) => {
  const g = generation;
  const ch = () => onChange?.();
  const isGen3to4 = g === 3 || g === 4;
  const isGen6Plus = g >= 6;
  const isGen7Plus = g >= 7;

  const markingColor = (val: number) => {
    if (val === 1) return '#1890ff';
    if (val === 2) return '#ff4d4f';
    return '#bfbfbf';
  };

  return (
    <div>
      {/* ──────────── Markings ──────────── */}
      <div style={sectionStyle}>
        <div style={sectionTitle}>标记 (Markings)</div>
        <Space size="small">
          {MARK_SYMBOLS.map((sym, i) => {
            const cur = pokemon.markings?.[i] ?? 0;
            return (
              <span
                key={i}
                onClick={() => {
                  const maxVal = isGen7Plus ? 2 : 1;
                  const next = (cur + 1) % (maxVal + 1);
                  const m = [...(pokemon.markings || [0, 0, 0, 0, 0, 0])];
                  m[i] = next;
                  pokemon.markings = m;
                  ch();
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 38,
                  height: 38,
                  borderRadius: 6,
                  border: `2px solid ${cur > 0 ? markingColor(cur) : '#d9d9d9'}`,
                  backgroundColor: cur > 0 ? `${markingColor(cur)}18` : '#fafafa',
                  cursor: 'pointer',
                  fontSize: 22,
                  lineHeight: 1,
                  color: markingColor(cur),
                  userSelect: 'none',
                  transition: 'border-color 0.15s, background-color 0.15s',
                }}
                title={`${sym} — ${cur === 0 ? '关' : cur === 1 ? '蓝色标记' : '红色标记'}`}
              >
                {sym}
              </span>
            );
          })}
        </Space>
        <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 6 }}>
          {isGen7Plus
            ? '点击循环：关 → 蓝 → 红 → 关'
            : '点击切换：关 ↔ 蓝'}
        </div>
      </div>

      {/* ──────────── Contest Stats (Gen3-4 only) ──────────── */}
      {isGen3to4 && (
        <div style={sectionStyle}>
          <div style={sectionTitle}>选美属性 (Contest Stats) — Gen3/4</div>
          <Space wrap size="middle">
            <div>
              <div style={labelStyle}>帅气 Cool</div>
              <InputNumber min={0} max={255} value={pokemon.contestCool ?? 0}
                onChange={(v) => { if (v !== null) { pokemon.contestCool = v; ch(); } }}
                style={{ width: 85 }} />
            </div>
            <div>
              <div style={labelStyle}>美丽 Beauty</div>
              <InputNumber min={0} max={255} value={pokemon.contestBeauty ?? 0}
                onChange={(v) => { if (v !== null) { pokemon.contestBeauty = v; ch(); } }}
                style={{ width: 85 }} />
            </div>
            <div>
              <div style={labelStyle}>可爱 Cute</div>
              <InputNumber min={0} max={255} value={pokemon.contestCute ?? 0}
                onChange={(v) => { if (v !== null) { pokemon.contestCute = v; ch(); } }}
                style={{ width: 85 }} />
            </div>
            <div>
              <div style={labelStyle}>聪明 Smart</div>
              <InputNumber min={0} max={255} value={pokemon.contestSmart ?? 0}
                onChange={(v) => { if (v !== null) { pokemon.contestSmart = v; ch(); } }}
                style={{ width: 85 }} />
            </div>
            <div>
              <div style={labelStyle}>强壮 Tough</div>
              <InputNumber min={0} max={255} value={pokemon.contestTough ?? 0}
                onChange={(v) => { if (v !== null) { pokemon.contestTough = v; ch(); } }}
                style={{ width: 85 }} />
            </div>
            <div>
              <div style={labelStyle}>光泽 Sheen</div>
              <InputNumber min={0} max={255} value={pokemon.contestSheen ?? 0}
                onChange={(v) => { if (v !== null) { pokemon.contestSheen = v; ch(); } }}
                style={{ width: 85 }} />
            </div>
          </Space>
          {pokemon.species === 327 && (
            <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 8 }}>
              注意：晃晃斑的选美属性独立于斑点图案，斑点由 PID 决定（见下方）。
            </div>
          )}
        </div>
      )}

      {/* ──────────── Origin Mark (Gen6+) ──────────── */}
      {isGen6Plus && (
        <div style={sectionStyle}>
          <div style={sectionTitle}>来源标记 (Origin Mark)</div>
          <OriginMarkDisplay mark={pokemon.originMark} />
        </div>
      )}

      {/* ──────────── Spinda Spots (only #327) ──────────── */}
      {pokemon.species === 327 && pokemon.pid != null && (
        <div style={sectionStyle}>
          <div style={sectionTitle}>
            晃晃斑斑点 (Spinda Spots)
            <span style={{ fontWeight: 400, fontSize: 11, color: '#8c8c8c', marginLeft: 8 }}>
              由 PID 唯一决定，每个晃晃斑都独一无二
            </span>
          </div>
          <SpindaCanvas pid={pokemon.pid} />
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════
// Origin Mark display sub-component
// ═══════════════════════════════════════════════
const OriginMarkDisplay: React.FC<{ mark?: number }> = ({ mark }) => {
  const info = ORIGIN_MARK_MAP[mark ?? 0] || ORIGIN_MARK_MAP[0];
  const isNone = (mark ?? 0) === 0;
  return (
    <div>
      <Tag
        color={isNone ? undefined : info.color}
        style={{
          fontSize: 13,
          padding: '2px 12px',
          borderRadius: 4,
          ...(isNone ? { color: '#8c8c8c', border: '1px dashed #d9d9d9', background: '#fafafa' } : {}),
        }}
      >
        {info.label}
      </Tag>
      <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 4 }}>
        只读 — 由来源游戏版本决定
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════
// Spinda spots Canvas sub-component
// ═══════════════════════════════════════════════
const SPRITE_NATIVE = 96;   // PokeAPI sprite dimensions
const DISPLAY = 192;        // 2× scale
const SPOT_AREA = 64;       // face area within sprite (centered)
const OFFSET_X = (SPRITE_NATIVE - SPOT_AREA) / 2; // 16
const OFFSET_Y = 8;         // face starts higher in sprite
const SCALE = DISPLAY / SPRITE_NATIVE;             // 2

const SpindaCanvas: React.FC<{ pid: number }> = ({ pid }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Reset
    setStatus('loading');
    ctx.clearRect(0, 0, DISPLAY, DISPLAY);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/327.png`;

    img.onload = () => {
      // Draw sprite scaled 2x
      ctx.drawImage(img, 0, 0, DISPLAY, DISPLAY);

      // Compute 4 spot positions from PID bytes
      const spots = getSpots(pid);

      // Spot display: map native spot coords (0-15 → 0-63px within spot area) to canvas
      const spotUnit = SPOT_AREA / 16;   // 4 px native
      const spotRadius = spotUnit * SCALE * 0.75; // ~6px display

      ctx.fillStyle = 'rgba(70, 50, 20, 0.88)'; // dark brown, slightly transparent
      for (const s of spots) {
        const nx = OFFSET_X + s.x * spotUnit + spotUnit / 2;
        const ny = OFFSET_Y + s.y * spotUnit + spotUnit / 2;
        const cx = nx * SCALE;
        const cy = ny * SCALE;
        ctx.beginPath();
        ctx.arc(cx, cy, spotRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      setStatus('ready');
    };

    img.onerror = () => {
      // Fallback: draw placeholder
      ctx.fillStyle = '#f5deb3';
      ctx.beginPath();
      ctx.arc(DISPLAY / 2, DISPLAY / 2, DISPLAY / 2 - 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5c4a3a';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('精灵图加载失败', DISPLAY / 2, DISPLAY / 2 + 4);
      setStatus('error');
    };
  }, [pid]);

  const spots = getSpots(pid);

  return (
    <div style={{ textAlign: 'center' }}>
      <canvas
        ref={canvasRef}
        width={DISPLAY}
        height={DISPLAY}
        style={{
          border: '1px solid #f0f0f0',
          borderRadius: 8,
          imageRendering: 'pixelated',
          background: '#fefefe',
        }}
      />
      <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 6 }}>
        {status === 'loading' && '加载精灵图中...'}
        {status === 'ready' &&
          `斑点坐标: (${spots.map(s => `${s.x},${s.y}`).join(') (')})`}
        {status === 'error' && '精灵图加载失败，斑点坐标仍如上所示'}
      </div>
      <code style={{
        display: 'inline-block',
        marginTop: 2,
        fontSize: 11,
        color: '#8c8c8c',
        background: '#f5f5f5',
        padding: '1px 8px',
        borderRadius: 3,
        fontFamily: 'monospace',
      }}>
        PID: {pid.toString(16).toUpperCase().padStart(8, '0')}
      </code>
    </div>
  );
};

/** Extract 4 spot positions from Spinda PID */
function getSpots(pid: number): { x: number; y: number }[] {
  const spots: { x: number; y: number }[] = [];
  for (let i = 0; i < 4; i++) {
    const byte = (pid >>> (i * 8)) & 0xff;
    const x = (byte >> 4) & 0xf; // upper nibble
    const y = byte & 0xf;        // lower nibble
    spots.push({ x, y });
  }
  return spots;
}

// ═══════════════════════════════════════════════
// Shared styles (match OTMiscTab conventions)
// ═══════════════════════════════════════════════
const sectionStyle: React.CSSProperties = {
  marginBottom: 16,
  padding: '12px 16px',
  background: '#fafafa',
  borderRadius: 6,
  border: '1px solid #f0f0f0',
};

const sectionTitle: React.CSSProperties = {
  fontWeight: 600,
  fontSize: 13,
  marginBottom: 10,
  color: '#595959',
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#8c8c8c',
  marginBottom: 2,
};

export default CosmeticTab;
