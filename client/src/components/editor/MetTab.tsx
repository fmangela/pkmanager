import React from 'react';
import { Select, InputNumber, DatePicker, Space } from 'antd';
import type { PokemonDto } from '../../api/saveFile';
import dayjs from 'dayjs';

interface Props {
  pokemon: PokemonDto;
  generation: number;
  onChange?: () => void;
}

const labelStyle: React.CSSProperties = { fontSize: 11, color: '#8c8c8c', marginBottom: 2 };

const MetTab: React.FC<Props> = ({ pokemon, generation, onChange }) => {
  const p = pokemon;
  const g = generation;
  const ch = () => onChange?.();
  const set = (key: keyof PokemonDto, val: any) => { (p as any)[key] = val; ch(); };

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <code style={{ fontSize: 12, background: '#f5f5f5', padding: '2px 6px', borderRadius: 4 }}>
          PID: {p.pid?.toString(16).toUpperCase().padStart(8, '0') || '—'}
        </code>
      </div>

      <Space style={{ width: '100%' }}>
        <div>
          <div style={labelStyle}>相遇地点</div>
          <InputNumber size="small" min={0} value={p.metLocation || 0} style={{ width: 150 }}
            onChange={(v) => set('metLocation', v ?? 0)} />
          <span style={{ fontSize: 10, color: '#888', marginLeft: 4 }}>
            {p.metLocationName || ''}
          </span>
        </div>
        <div>
          <div style={labelStyle}>相遇等级</div>
          <InputNumber size="small" min={0} max={100} value={p.metLevel || 0} style={{ width: 90 }}
            onChange={(v) => set('metLevel', v ?? 0)} />
        </div>
      </Space>

      <div style={{ marginTop: 8 }}>
        <div style={labelStyle}>来源游戏</div>
        <Select size="small" value={p.originGame} style={{ width: 260 }} disabled>
          <Select.Option value={p.originGame}>
            {p.originGameName || `Game ${p.originGame}`}
          </Select.Option>
        </Select>
      </div>

      {g >= 4 && (
        <Space style={{ width: '100%', marginTop: 8 }}>
          <div>
            <div style={labelStyle}>相遇日期</div>
            <DatePicker size="small" value={p.metDate ? dayjs(p.metDate) : null} style={{ width: 150 }}
              onChange={(_, dateStr) => { p.metDate = dateStr as string; ch(); }} />
          </div>
          <div>
            <div style={labelStyle}>蛋地点</div>
            <InputNumber size="small" min={0} value={p.eggLocation || 0} style={{ width: 140 }}
              onChange={(v) => set('eggLocation', v ?? 0)} />
          </div>
          <div>
            <div style={labelStyle}>蛋日期</div>
            <DatePicker size="small" value={p.eggDate ? dayjs(p.eggDate) : null} style={{ width: 150 }}
              onChange={(_, dateStr) => { p.eggDate = dateStr as string; ch(); }} />
          </div>
        </Space>
      )}

      {g === 2 && (
        <div style={{ marginTop: 8 }}>
          <div style={labelStyle}>相遇时间</div>
          <Select size="small" value={p.metTimeOfDay || 0} style={{ width: 140 }}
            onChange={(v) => set('metTimeOfDay', v)}
            options={[
              { value: 0, label: '任何时间' }, { value: 1, label: '早晨' },
              { value: 2, label: '白天' }, { value: 3, label: '夜晚' },
            ]} />
        </div>
      )}

      {g === 4 && (
        <div style={{ marginTop: 8 }}>
          <div style={labelStyle}>地面格子 (Ground Tile)</div>
          <InputNumber size="small" min={0} max={65535} value={p.groundTile || 0}
            onChange={(v) => set('groundTile', v ?? 0)} />
        </div>
      )}

      {g >= 8 && (
        <div style={{ marginTop: 8 }}>
          <div style={labelStyle}>对战版本</div>
          <InputNumber size="small" min={0} value={p.battleVersion || 0} style={{ width: 100 }}
            onChange={(v) => set('battleVersion', v ?? 0)} />
        </div>
      )}

      {g >= 9 && (
        <div style={{ marginTop: 8 }}>
          <div style={labelStyle}>服从等级</div>
          <InputNumber size="small" min={0} max={100} value={p.obedienceLevel || 0}
            onChange={(v) => set('obedienceLevel', v ?? 0)} />
        </div>
      )}
    </div>
  );
};

export default MetTab;
