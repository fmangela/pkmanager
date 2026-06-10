// ── PokemonSprite Component ─────────────────────────────────────
// 统一宝可梦精灵图展示，三级回退链（本地 → 远端 → SVG 占位），
// useState 驱动阶段保护，杜绝死循环。
// 外层 key={speciesId} 保证 species 变化时内部 state 完全重置，
// 避免 useEffect / render-phase ref 的 lint 问题。

import React, { useState } from 'react';
import { getPokemonSpriteUrl, getPokeApiSpriteUrl } from '../lib/spriteUrl';

interface PokemonSpriteProps {
  speciesId: number;
  /** 透传常见 img 属性 */
  alt?: string;
  width?: number;
  height?: number;
  style?: React.CSSProperties;
  className?: string;
}

/** 内联 SVG 占位 — 浅灰底 + 物种编号 */
function placeholderSvg(speciesId: number, w: number, h: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">`
    + `<rect fill="%23f0f0f0" width="${w}" height="${h}" rx="4"/>`
    + `<text x="${w / 2}" y="${h / 2}" text-anchor="middle" dy=".3em" fill="%23999" font-size="${Math.max(8, w / 5)}">${speciesId}</text>`
    + `</svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

// ── Inner component — stateful, re-mounts when key changes ─────────

const PokemonSpriteInner: React.FC<PokemonSpriteProps> = ({
  speciesId, alt, width = 32, height = 32, style, className,
}) => {
  // Stage 0 = local, 1 = remote PokeAPI, 2 = SVG placeholder, 3 = terminal (no handler)
  const [stage, setStage] = useState<0 | 1 | 2 | 3>(0);

  const src =
    stage === 0 ? getPokemonSpriteUrl(speciesId) :
    stage === 1 ? getPokeApiSpriteUrl(speciesId) :
    placeholderSvg(speciesId, width, height);

  const handleError = stage < 2
    ? () => setStage((s) => (s + 1) as 0 | 1 | 2 | 3)
    : undefined; // Stage 2+ — 移除 handler，杜绝死循环

  return (
    <img
      src={src}
      alt={alt ?? `#${speciesId}`}
      width={width}
      height={height}
      style={style}
      className={className}
      onError={handleError}
    />
  );
};

// ── Outer component — key={speciesId} drives clean remount on species change ─
const PokemonSprite: React.FC<PokemonSpriteProps> = (props) => (
  <PokemonSpriteInner key={props.speciesId} {...props} />
);

export default PokemonSprite;
