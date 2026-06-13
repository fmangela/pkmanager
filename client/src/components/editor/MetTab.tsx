import React, { useState, useCallback, useEffect } from 'react';
import {
  Select, InputNumber, DatePicker, Space, Collapse, Button, Table, Tag, Checkbox,
  Popconfirm, App,
} from 'antd';
import { SearchOutlined, PlusOutlined } from '@ant-design/icons';
import type { PokemonDto } from '../../api/saveFile';
import { encounterApi, type EncounterItemDto, type EncounterSearchRequest } from '../../api/encounter';
import { useResourceStore } from '../../stores/resourceStore';
import { buildEditRequest } from './editHelpers';
import dayjs from 'dayjs';

interface Props {
  pokemon: PokemonDto;
  generation: number;
  onChange?: () => void;
  saveFileId?: string;
  boxCount?: number;
  onGenerated?: () => void;
}

const labelStyle: React.CSSProperties = { fontSize: 11, color: '#8c8c8c', marginBottom: 2 };

const ENCOUNTER_TYPE_OPTIONS = [
  { label: '野外', value: 'Slot' },
  { label: '静态', value: 'Static' },
  { label: '交换', value: 'Trade' },
  { label: '配信', value: 'Mystery' },
  { label: '蛋', value: 'Egg' },
];

const ENCOUNTER_TYPE_COLORS: Record<string, string> = {
  Egg: 'pink',
  Mystery: 'purple',
  Static: 'orange',
  Trade: 'blue',
  Slot: 'green',
};

const SHINY_COLORS: Record<string, string> = {
  Never: '#888',
  Random: '#555',
  Always: 'gold',
  AlwaysStar: '#faad14',
  AlwaysSquare: '#fa541c',
  FixedValue: '#722ed1',
};

const MetTab: React.FC<Props> = ({ pokemon, generation, onChange, saveFileId, boxCount, onGenerated }) => {
  const p = pokemon;
  const g = generation;
  const ch = () => onChange?.();
  const set = (key: keyof PokemonDto, val: any) => { (p as any)[key] = val; ch(); };

  const { species: speciesList } = useResourceStore();
  const { message } = App.useApp();

  // ── Encounter search state ──
  const [searchSpecies, setSearchSpecies] = useState<number | undefined>(p.species);
  const [searchForm, setSearchForm] = useState<number>(p.form ?? 0);
  const [searchLevelMin, setSearchLevelMin] = useState<number | undefined>(undefined);
  const [searchLevelMax, setSearchLevelMax] = useState<number | undefined>(undefined);
  const [searchTypes, setSearchTypes] = useState<string[]>(['Slot', 'Static', 'Trade', 'Mystery', 'Egg']);
  const [results, setResults] = useState<EncounterItemDto[]>([]);
  const [searching, setSearching] = useState(false);
  const [generatingIndex, setGeneratingIndex] = useState<number | null>(null);
  const [targetBox, setTargetBox] = useState(0);
  const [targetSlot, setTargetSlot] = useState(0);

  // Reset search context when editing a different Pokémon or save
  useEffect(() => {
    setSearchSpecies(p.species);
    setSearchForm(p.form ?? 0);
    setResults([]);
  }, [p.species, p.form, saveFileId]);

  const speciesOptions = speciesList.map(s => ({ value: s.id, label: `${s.name} (#${s.id})` }));

  // ── Actions ──

  const handleSearch = useCallback(async () => {
    if (!searchSpecies || !saveFileId) return;
    setSearching(true);
    try {
      const req: EncounterSearchRequest = {
        species: searchSpecies,
        form: searchForm,
        saveFileId,
        levelMin: searchLevelMin,
        levelMax: searchLevelMax,
        encounterTypes: searchTypes.length > 0 ? searchTypes : undefined,
      };
      const res = await encounterApi.search(req);
      setResults(res.data.items);
      if (res.data.totalCount === 0) {
        message.info('未找到合法遭遇模板');
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(msg || '搜索失败');
    } finally {
      setSearching(false);
    }
  }, [searchSpecies, searchForm, saveFileId, searchLevelMin, searchLevelMax, searchTypes, message]);

  const handleApply = useCallback(async (item: EncounterItemDto) => {
    if (!saveFileId || !p.pkmDataBase64) return;
    const editSnapshot = buildEditRequest(p);
    try {
      const res = await encounterApi.applyEncounter({
        recomputeToken: item.recomputeToken,
        pkmDataBase64: p.pkmDataBase64,
        editSnapshot,
        saveFileId,
      });
      const result = res.data;
      if (result.success && result.pokemon) {
        Object.assign(p, result.pokemon);
        ch();
        message.success(`已应用遭遇约束: ${result.appliedFields.join(', ')}`);
      } else {
        message.warning(result.error || '应用失败');
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(msg || '应用失败');
    }
  }, [saveFileId, p, ch, message]);

  const handleGenerate = useCallback(async (item: EncounterItemDto) => {
    if (!saveFileId) return;
    setGeneratingIndex(item.index);
    try {
      const res = await encounterApi.generateFromEncounter({
        recomputeToken: item.recomputeToken,
        saveFileId,
        boxIndex: targetBox,
        slotIndex: targetSlot,
        allowOverwrite: false,
      });
      const result = res.data;
      if (result.success) {
        message.success(result.isLegal ? '宝可梦已生成并写入存档' : '已生成（⚠️ 不合法）');
        setTimeout(() => onGenerated?.(), 300);
      } else {
        message.error(result.error || '生成失败');
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(msg || '生成失败');
    } finally {
      setGeneratingIndex(null);
    }
  }, [saveFileId, targetBox, targetSlot, message, onGenerated]);

  // ── Table columns ──

  const columns = [
    {
      title: '类型', dataIndex: 'encounterType', width: 55,
      render: (t: string) => <Tag color={ENCOUNTER_TYPE_COLORS[t] || 'default'}>{t === 'Mystery' ? '配信' : t === 'Static' ? '静态' : t === 'Trade' ? '交换' : t === 'Slot' ? '野外' : t}</Tag>,
    },
    {
      title: '版本', dataIndex: 'versionName', width: 90,
      render: (v: string, r: EncounterItemDto) => <Tag>{v || `Gen${r.generation}`}</Tag>,
    },
    {
      title: '地点', dataIndex: 'locationName', ellipsis: true,
      render: (v: string | null) => <span style={{ fontSize: 12 }}>{v || '—'}</span>,
    },
    {
      title: '等级', width: 55,
      render: (_: unknown, r: EncounterItemDto) => (
        <span style={{ fontSize: 12 }}>{r.levelMin === r.levelMax ? `Lv${r.levelMin}` : `${r.levelMin}-${r.levelMax}`}</span>
      ),
    },
    {
      title: '闪光', dataIndex: 'shiny', width: 60,
      render: (v: string) => {
        const label = v === 'Never' ? '永不' : v === 'Random' ? '随机' : v === 'Always' ? '必闪' : v === 'AlwaysStar' ? '方闪' : v === 'AlwaysSquare' ? '星闪' : v;
        return <span style={{ fontSize: 11, color: SHINY_COLORS[v] || '#555' }}>{label}</span>;
      },
    },
    {
      title: '操作', width: 130,
      render: (_: any, item: EncounterItemDto) => (
        <Space size={4}>
          <Button type="link" size="small" onClick={() => handleApply(item)}>应用</Button>
          <Popconfirm
            title="生成到存档"
            description={
              <Space direction="vertical" size={4}>
                <span>箱子: <InputNumber size="small" min={0} max={(boxCount ?? 32) - 1} value={targetBox} onChange={v => setTargetBox(v ?? 0)} /></span>
                <span>槽位: <InputNumber size="small" min={0} max={29} value={targetSlot} onChange={v => setTargetSlot(v ?? 0)} /></span>
              </Space>
            }
            onConfirm={() => handleGenerate(item)}
            okText="生成"
            cancelText="取消"
          >
            <Button type="link" size="small" icon={<PlusOutlined />} loading={generatingIndex === item.index}>生成</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      {/* ── Existing Met fields ── */}
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

      {/* ── Encounter search panel ── */}
      {saveFileId && (
        <Collapse
          style={{ marginTop: 16 }}
          items={[{
            key: 'encounter-search',
            label: '🔍 遭遇搜索',
            forceRender: true,
            children: (
              <div>
                <Space wrap style={{ marginBottom: 8 }}>
                  <Select
                    showSearch
                    size="small"
                    placeholder="选择物种"
                    value={searchSpecies}
                    onChange={(v) => { setSearchSpecies(v); setSearchForm(0); }}
                    options={speciesOptions}
                    style={{ width: 200 }}
                    filterOption={(input, option) =>
                      (option?.label as string)?.toLowerCase().includes(input.toLowerCase())}
                  />
                  <InputNumber size="small" placeholder="形态" min={0} max={255}
                    value={searchForm} onChange={v => setSearchForm(v ?? 0)} style={{ width: 70 }} />
                  <InputNumber size="small" placeholder="最低等级" min={1} max={100}
                    value={searchLevelMin} onChange={v => setSearchLevelMin(v ?? undefined)} style={{ width: 90 }} />
                  <span style={{ fontSize: 12, color: '#888' }}>—</span>
                  <InputNumber size="small" placeholder="最高等级" min={1} max={100}
                    value={searchLevelMax} onChange={v => setSearchLevelMax(v ?? undefined)} style={{ width: 90 }} />
                  <Button size="small" type="primary" icon={<SearchOutlined />}
                    onClick={handleSearch} loading={searching}>搜索</Button>
                </Space>
                <Checkbox.Group
                  options={ENCOUNTER_TYPE_OPTIONS}
                  value={searchTypes}
                  onChange={v => setSearchTypes(v as string[])}
                  style={{ marginBottom: 8 }}
                />
                {results.length > 0 && (
                  <Table
                    dataSource={results}
                    columns={columns}
                    rowKey="index"
                    size="small"
                    pagination={{ pageSize: 20, size: 'small', showSizeChanger: false }}
                    scroll={{ x: 600 }}
                  />
                )}
              </div>
            ),
          }]}
        />
      )}
    </div>
  );
};

export default MetTab;
