import React from 'react';
import { useTranslation } from 'react-i18next';

// ── 轴配置：6 项能力的角度（deg），显式指定 statIndex → values[] 映射 ──
interface AxisConfig {
  label: string;
  statIndex: number; // 0=HP, 1=ATK, 2=DEF, 3=SPA, 4=SPD, 5=SPE
  angle: number;     // 数学角度，0=右，顺时针
}

interface Props {
  values: number[];      // 6 项能力值，按 [HP, ATK, DEF, SPA, SPD, SPE]
  maxValue?: number;     // 径向轴最大值，默认 255
  size?: number;         // SVG 尺寸，默认 220
  title?: string;        // 底部标题
}

const StatsRadar: React.FC<Props> = ({ values, maxValue = 255, size = 220, title }) => {
  const { t } = useTranslation('editor');
  const AXES: AxisConfig[] = [
    { label: 'HP', statIndex: 0, angle: -90 },
    { label: t('stats.atkShort', '攻击'), statIndex: 1, angle: -30 },
    { label: t('stats.defShort', '防御'), statIndex: 2, angle: 30 },
    { label: t('stats.spaShort', '特攻'), statIndex: 3, angle: 90 },
    { label: t('stats.spdShort', '特防'), statIndex: 4, angle: 150 },
    { label: t('stats.speShort', '速度'), statIndex: 5, angle: 210 },
  ];
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.33;                     // 数据半径（留标签空间）
  const levels = [0.25, 0.5, 0.75, 1.0];    // 背景刻度环

  const toPoint = (angleDeg: number, distance: number) => {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: cx + distance * Math.cos(rad), y: cy + distance * Math.sin(rad) };
  };

  // ── 数据点 ──
  const dataPoints = AXES.map(a => {
    const v = values[a.statIndex] ?? 0;
    return toPoint(a.angle, r * Math.min(v / maxValue, 1));
  });

  const polygonPath = dataPoints.map((p, i) =>
    `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`
  ).join(' ') + ' Z';

  // ── 背景六边形刻度环 path ──
  const rings = levels.map(lv => {
    const pts = AXES.map(a => toPoint(a.angle, r * lv));
    return pts.map((p, i) =>
      `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`
    ).join(' ') + ' Z';
  });

  const total = values.reduce((s, v) => s + (v || 0), 0);

  return (
    <div style={{ display: 'inline-block', lineHeight: 1 }}>
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ display: 'block' }}
      role="img"
      aria-label={title ?? t('stats.radarTitle', '种族值雷达图')}
    >
      {/* 背景刻度环 */}
      {rings.map((d, i) => (
        <path key={`ring-${i}`} d={d} fill="none" stroke="#e8e8e8" strokeWidth={0.8} />
      ))}

      {/* 轴线 */}
      {AXES.map(a => {
        const end = toPoint(a.angle, r);
        return (
          <line key={`ln-${a.statIndex}`}
            x1={cx} y1={cy} x2={end.x.toFixed(1)} y2={end.y.toFixed(1)}
            stroke="#f0f0f0" strokeWidth={0.8}
          />
        );
      })}

      {/* 数据多边形 */}
      <path d={polygonPath} fill="rgba(24,144,255,0.18)" stroke="#1890ff" strokeWidth={1.8} />

      {/* 数据点 */}
      {dataPoints.map((p, i) => (
        <circle key={`dot-${i}`} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r={2.5} fill="#1890ff" />
      ))}

      {/* 顶点标签 — 名称 + 数值 */}
      {AXES.map(a => {
        const pos = toPoint(a.angle, r + 24);
        const v = values[a.statIndex] ?? 0;
        return (
          <text key={`lbl-${a.statIndex}`}
            x={pos.x.toFixed(1)} y={pos.y.toFixed(1)}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={10} fill="#595959" fontFamily="sans-serif"
          >
            <tspan x={pos.x.toFixed(1)} dy={-4}>{a.label}</tspan>
            <tspan x={pos.x.toFixed(1)} dy={11} fontSize={9} fill="#8c8c8c">{v}</tspan>
          </text>
        );
      })}

      {/* 中心总计 */}
      <text x={cx} y={cy}
        textAnchor="middle" dominantBaseline="middle"
        fontSize={11} fontWeight={600} fill="#434343" fontFamily="sans-serif"
      >
        {total}
      </text>

    </svg>
    {/* 标题移到 SVG 外，避免与底部轴标签重叠 */}
    {title && (
      <div style={{ textAlign: 'center', fontSize: 10, color: '#8c8c8c', marginTop: 2 }}>
        {title}
      </div>
    )}
  </div>
  );
};

export default StatsRadar;
