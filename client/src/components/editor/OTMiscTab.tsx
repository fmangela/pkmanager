import React, { useEffect, useState } from 'react';
import { Input, InputNumber, Select, Space } from 'antd';
import type { PokemonDto } from '../../api/saveFile';
import { resourceApi, type ResourceItem } from '../../api/resource';
import { useDiagnosticStore } from '../../stores/diagnosticStore';

interface Props {
  pokemon: PokemonDto;
  generation: number;
  onChange?: () => void;
}

const CONSOLE_OPTIONS = [
  { value: 0, label: '日本 (JPN)' },
  { value: 1, label: '美洲 (USA)' },
  { value: 2, label: '欧洲 (EUR)' },
  { value: 3, label: '澳洲 (AUS)' },
  { value: 4, label: '中国 (CHN)' },
  { value: 5, label: '韩国 (KOR)' },
  { value: 6, label: '台湾 (TWN)' },
];

const OTMiscTab: React.FC<Props> = ({ pokemon, generation, onChange }) => {
  const g = generation;
  const ch = () => onChange?.();
  const isGen6Plus = g >= 6;
  const isGen7Plus = g >= 7;
  const isGen8Plus = g >= 8;
  const isGen67 = g === 6 || g === 7;

  // Geo data
  const [countries, setCountries] = useState<ResourceItem[]>([]);
  const [regions, setRegions] = useState<ResourceItem[]>([]);

  useEffect(() => {
    resourceApi.geoCountries().then(r => setCountries(r.data || [])).catch((err: any) => {
      useDiagnosticStore.getState().log({ category: 'api', level: 'error', message: '加载国家列表失败', stack: err?.message });
    });
  }, []);

  useEffect(() => {
    const cid = pokemon.country || 0;
    if (cid > 0) {
      resourceApi.geoRegions(cid).then(r => setRegions(r.data || [])).catch((err: any) => {
        setRegions([]);
        useDiagnosticStore.getState().log({ category: 'api', level: 'error', message: `加载地区列表失败 (country=${cid})`, stack: err?.message });
      });
    } else {
      setRegions([]);
    }
  }, [pokemon.country]);

  return (
    <div>
      {/* 训练家 ID */}
      <div style={sectionStyle}>
        <div style={sectionTitle}>训练家身份</div>
        <Space wrap size="middle">
          <div>
            <div style={labelStyle}>表ID (TID)</div>
            <InputNumber
              min={0} max={65535}
              value={pokemon.tid}
              onChange={(v) => { if (v !== null) { pokemon.tid = v; ch(); } }}
              style={{ width: 100 }}
            />
          </div>
          <div>
            <div style={labelStyle}>里ID (SID)</div>
            <InputNumber
              min={0} max={65535}
              value={pokemon.sid}
              onChange={(v) => { if (v !== null) { pokemon.sid = v; ch(); } }}
              style={{ width: 100 }}
            />
          </div>
          {isGen7Plus && (
            <div>
              <div style={labelStyle}>显示TID (6位)</div>
              <Input
                readOnly
                value={String(pokemon.tid).padStart(6, '0')}
                style={{ width: 100, color: '#8c8c8c' }}
              />
            </div>
          )}
        </Space>
      </div>

      {/* 训练家名称 */}
      <div style={sectionStyle}>
        <div style={sectionTitle}>训练家名称</div>
        <Space wrap size="middle">
          <div>
            <div style={labelStyle}>初训家 (OT)</div>
            <Input
              maxLength={12}
              value={pokemon.originalTrainerName || ''}
              onChange={(e) => { pokemon.originalTrainerName = e.target.value; ch(); }}
              style={{ width: 140 }}
            />
          </div>
          <div>
            <div style={labelStyle}>性别</div>
            <Select
              value={pokemon.originalTrainerGender}
              onChange={(v) => { pokemon.originalTrainerGender = v; ch(); }}
              style={{ width: 90 }}
              options={[
                { value: 0, label: '男 ♂' },
                { value: 1, label: '女 ♀' },
              ]}
            />
          </div>
          {isGen6Plus && (
            <>
              <div>
                <div style={labelStyle}>现持有人 (HT)</div>
                <Input
                  maxLength={12}
                  value={pokemon.handlingTrainerName || ''}
                  onChange={(e) => { pokemon.handlingTrainerName = e.target.value; ch(); }}
                  style={{ width: 140 }}
                />
              </div>
              <div>
                <div style={labelStyle}>HT性别</div>
                <Select
                  value={pokemon.handlingTrainerGender}
                  onChange={(v) => { pokemon.handlingTrainerGender = v; ch(); }}
                  style={{ width: 90 }}
                  options={[
                    { value: 0, label: '男 ♂' },
                    { value: 1, label: '女 ♀' },
                  ]}
                />
              </div>
              <div>
                <div style={labelStyle}>HT语言</div>
                <Select
                  value={pokemon.handlingTrainerLanguage}
                  onChange={(v) => { pokemon.handlingTrainerLanguage = v; ch(); }}
                  style={{ width: 120 }}
                  options={[
                    { value: 1, label: '日本語' },
                    { value: 2, label: 'English' },
                    { value: 3, label: 'Français' },
                    { value: 4, label: 'Italiano' },
                    { value: 5, label: 'Deutsch' },
                    { value: 7, label: 'Español' },
                    { value: 8, label: '한국어' },
                    { value: 9, label: '简体中文' },
                    { value: 10, label: '繁體中文' },
                  ]}
                />
              </div>
            </>
          )}
        </Space>
      </div>

      {/* 亲密度 */}
      <div style={sectionStyle}>
        <div style={sectionTitle}>亲密度</div>
        <Space wrap size="middle">
          <div>
            <div style={labelStyle}>初训家亲密度</div>
            <InputNumber
              min={0} max={255}
              value={pokemon.originalTrainerFriendship}
              onChange={(v) => { if (v !== null) pokemon.originalTrainerFriendship = v; ch(); }}
              style={{ width: 85 }}
            />
          </div>
          {isGen8Plus && (
            <div>
              <div style={labelStyle}>现持有人亲密度</div>
              <InputNumber
                min={0} max={255}
                value={pokemon.handlingTrainerFriendship}
                onChange={(v) => { if (v !== null) pokemon.handlingTrainerFriendship = v; ch(); }}
                style={{ width: 85 }}
              />
            </div>
          )}
          {isGen6Plus && pokemon.affection !== null && pokemon.affection !== undefined && (
            <div>
              <div style={labelStyle}>好感度 (Amie)</div>
              <InputNumber
                min={0} max={255}
                value={pokemon.affection}
                onChange={(v) => { if (v !== null) pokemon.affection = v; ch(); }}
                style={{ width: 85 }}
              />
            </div>
          )}
        </Space>
      </div>

      {/* 3DS 区域 (Gen6-7) */}
      {isGen67 && (
        <div style={sectionStyle}>
          <div style={sectionTitle}>3DS 区域信息 (Gen6-7)</div>
          <Space wrap size="middle">
            <div>
              <div style={labelStyle}>国家</div>
              <Select size="small" showSearch
                value={pokemon.country || 0}
                onChange={(v) => { pokemon.country = v; pokemon.subRegion = 0; ch(); }}
                style={{ width: 140 }}
                options={[{value:0,label:'—'}, ...countries.map(c=>({value:c.id,label:c.name}))]}
              />
            </div>
            <div>
              <div style={labelStyle}>地区</div>
              <Select size="small" showSearch
                value={pokemon.subRegion || 0}
                onChange={(v) => { pokemon.subRegion = v; ch(); }}
                style={{ width: 160 }}
                options={regions.length > 0 ? regions.map(r=>({value:r.id,label:r.name})) : [{value:0,label:'—'}]}
              />
            </div>
            <div>
              <div style={labelStyle}>3DS区域</div>
              <Select size="small"
                value={pokemon.consoleRegion || 0}
                onChange={(v) => { pokemon.consoleRegion = v; ch(); }}
                style={{ width: 140 }}
                options={CONSOLE_OPTIONS}
              />
            </div>
            <div>
              <div style={labelStyle}>收藏</div>
              <Select
                value={pokemon.isFavorite ? 1 : 0}
                onChange={(v) => { pokemon.isFavorite = v === 1; ch(); }}
                style={{ width: 80 }}
                options={[
                  { value: 0, label: '否' },
                  { value: 1, label: '是 ★' },
                ]}
              />
            </div>
          </Space>
        </div>
      )}

      {/* 加密信息 */}
      <div style={sectionStyle}>
        <div style={sectionTitle}>加密信息</div>
        <Space direction="vertical" style={{ width: '100%' }}>
          <code style={{
            display: 'block', background: '#f5f5f5', padding: '6px 10px',
            borderRadius: 4, fontSize: 13, fontFamily: 'monospace',
          }}>
            PID: {pokemon.pid?.toString(16).toUpperCase().padStart(8, '0') || '—'}
          </code>
          <code style={{
            display: 'block', background: '#f5f5f5', padding: '6px 10px',
            borderRadius: 4, fontSize: 13, fontFamily: 'monospace',
          }}>
            EC:  {pokemon.ec?.toString(16).toUpperCase().padStart(8, '0') || '—'}
          </code>
        </Space>
      </div>

      {/* HOME追踪ID */}
      {isGen8Plus && pokemon.homeTracker && (
        <div style={sectionStyle}>
          <div style={sectionTitle}>HOME 追踪 ID</div>
          <code style={{
            display: 'block', background: '#f0f0f0', padding: '6px 10px',
            borderRadius: 4, fontSize: 13, fontFamily: 'monospace',
          }}>
            {pokemon.homeTracker}
          </code>
        </div>
      )}
    </div>
  );
};

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

// ── 3DS Country/Region options (PKHeX Chinese names) ──

export default OTMiscTab;
