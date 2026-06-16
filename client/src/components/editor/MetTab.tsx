import React, { useState, useCallback, useEffect } from 'react';
import {
  Select, InputNumber, DatePicker, Space, Collapse, Button, Table, Tag, Checkbox,
  Popconfirm, App,
} from 'antd';
import { SearchOutlined, PlusOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { ApiError } from '../../api/axios';
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

function setPokemonField<K extends keyof PokemonDto>(pokemon: PokemonDto, key: K, val: PokemonDto[K]): void {
  pokemon[key] = val;
}

function getErrorMessage(err: unknown, fallback: string): string {
  return (err as ApiError | undefined)?.response?.data?.message || fallback;
}

const MetTab: React.FC<Props> = ({ pokemon, generation, onChange, saveFileId, boxCount, onGenerated }) => {
  const { t } = useTranslation(['editor', 'messages', 'common']);
  const p = pokemon;
  const g = generation;
  const ch = () => onChange?.();
  const set = <K extends keyof PokemonDto>(key: K, val: PokemonDto[K]) => { setPokemonField(p, key, val); ch(); };
  const et = (key: string, defaultValue: string, options?: Record<string, unknown>) =>
    t(key, { ns: 'editor', defaultValue, ...(options ?? {}) });
  const ct = (key: string, defaultValue: string, options?: Record<string, unknown>) =>
    t(key, { ns: 'common', defaultValue, ...(options ?? {}) });

  const { species: speciesList } = useResourceStore();
  const { message } = App.useApp();
  const ENCOUNTER_TYPE_OPTIONS = [
    { label: et('met.typeWild', '野外'), value: 'Slot' },
    { label: et('met.typeStatic', '静态'), value: 'Static' },
    { label: et('met.typeTrade', '交换'), value: 'Trade' },
    { label: et('met.typeMystery', '配信'), value: 'Mystery' },
    { label: et('met.typeEgg', '蛋'), value: 'Egg' },
  ];

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
        message.info(et('met.noEncounterTemplate', '未找到合法遭遇模板'));
      }
    } catch (err: unknown) {
      message.error(getErrorMessage(err, et('met.searchFailed', '搜索失败')));
    } finally {
      setSearching(false);
    }
  }, [et, message, saveFileId, searchForm, searchLevelMax, searchLevelMin, searchSpecies, searchTypes]);

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
        message.success(et('met.appliedConstraints', '已应用遭遇约束: {{fields}}', {
          fields: result.appliedFields.join(', '),
        }));
      } else {
        message.warning(result.error || et('met.applyFailed', '应用失败'));
      }
    } catch (err: unknown) {
      message.error(getErrorMessage(err, et('met.applyFailed', '应用失败')));
    }
  }, [ch, et, message, p, saveFileId]);

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
        message.success(result.isLegal
          ? et('met.generatedSaved', '宝可梦已生成并写入存档')
          : et('met.generatedIllegal', '已生成（⚠️ 不合法）'));
        setTimeout(() => onGenerated?.(), 300);
      } else {
        message.error(result.error || et('met.generateFailed', '生成失败'));
      }
    } catch (err: unknown) {
      message.error(getErrorMessage(err, et('met.generateFailed', '生成失败')));
    } finally {
      setGeneratingIndex(null);
    }
  }, [et, message, onGenerated, saveFileId, targetBox, targetSlot]);

  // ── Table columns ──

  const columns = [
    {
      title: et('met.colType', '类型'), dataIndex: 'encounterType', width: 55,
      render: (value: string) => <Tag color={ENCOUNTER_TYPE_COLORS[value] || 'default'}>{value === 'Mystery' ? et('met.typeMystery', '配信') : value === 'Static' ? et('met.typeStatic', '静态') : value === 'Trade' ? et('met.typeTrade', '交换') : value === 'Slot' ? et('met.typeWild', '野外') : value}</Tag>,
    },
    {
      title: et('met.colVersion', '版本'), dataIndex: 'versionName', width: 90,
      render: (v: string, r: EncounterItemDto) => <Tag>{v || `Gen${r.generation}`}</Tag>,
    },
    {
      title: et('met.colLocation', '地点'), dataIndex: 'locationName', ellipsis: true,
      render: (v: string | null) => <span style={{ fontSize: 12 }}>{v || '—'}</span>,
    },
    {
      title: et('met.colLevel', '等级'), width: 55,
      render: (_: unknown, r: EncounterItemDto) => (
        <span style={{ fontSize: 12 }}>{r.levelMin === r.levelMax ? `Lv${r.levelMin}` : `${r.levelMin}-${r.levelMax}`}</span>
      ),
    },
    {
      title: et('met.colShiny', '闪光'), dataIndex: 'shiny', width: 60,
      render: (v: string) => {
        const label = v === 'Never' ? et('met.shinyNever', '永不') : v === 'Random' ? et('met.shinyRandom', '随机') : v === 'Always' ? et('met.shinyAlways', '必闪') : v === 'AlwaysStar' ? et('met.shinyAlwaysStar', '方闪') : v === 'AlwaysSquare' ? et('met.shinyAlwaysSquare', '星闪') : v;
        return <span style={{ fontSize: 11, color: SHINY_COLORS[v] || '#555' }}>{label}</span>;
      },
    },
    {
      title: et('met.colActions', '操作'), width: 130,
      render: (_: unknown, item: EncounterItemDto) => (
        <Space size={4}>
          <Button type="link" size="small" onClick={() => handleApply(item)}>{et('met.apply', '应用')}</Button>
          <Popconfirm
            title={et('met.generateToSave', '生成到存档')}
            description={
              <Space direction="vertical" size={4}>
                <span>{et('met.box', '箱子')}: <InputNumber size="small" min={0} max={(boxCount ?? 32) - 1} value={targetBox} onChange={v => setTargetBox(v ?? 0)} /></span>
                <span>{et('met.slot', '槽位')}: <InputNumber size="small" min={0} max={29} value={targetSlot} onChange={v => setTargetSlot(v ?? 0)} /></span>
              </Space>
            }
            onConfirm={() => handleGenerate(item)}
            okText={et('met.generate', '生成')}
            cancelText={ct('cancel', '取消')}
          >
            <Button type="link" size="small" icon={<PlusOutlined />} loading={generatingIndex === item.index}>{et('met.generate', '生成')}</Button>
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
          <div style={labelStyle}>{et('met.metLocation', '相遇地点')}</div>
          <InputNumber size="small" min={0} value={p.metLocation || 0} style={{ width: 150 }}
            onChange={(v) => set('metLocation', v ?? 0)} />
          <span style={{ fontSize: 10, color: '#888', marginLeft: 4 }}>
            {p.metLocationName || ''}
          </span>
        </div>
        <div>
          <div style={labelStyle}>{et('met.metLevel', '相遇等级')}</div>
          <InputNumber size="small" min={0} max={100} value={p.metLevel || 0} style={{ width: 90 }}
            onChange={(v) => set('metLevel', v ?? 0)} />
        </div>
      </Space>

      <div style={{ marginTop: 8 }}>
        <div style={labelStyle}>{et('met.originGame', '来源游戏')}</div>
        <Select size="small" value={p.originGame} style={{ width: 260 }} disabled>
          <Select.Option value={p.originGame}>
            {p.originGameName || `Game ${p.originGame}`}
          </Select.Option>
        </Select>
      </div>

      {g >= 4 && (
        <Space style={{ width: '100%', marginTop: 8 }}>
          <div>
            <div style={labelStyle}>{et('met.metDate', '相遇日期')}</div>
            <DatePicker size="small" value={p.metDate ? dayjs(p.metDate) : null} style={{ width: 150 }}
              onChange={(_, dateStr) => { p.metDate = dateStr as string; ch(); }} />
          </div>
          <div>
            <div style={labelStyle}>{et('met.eggLocation', '蛋地点')}</div>
            <InputNumber size="small" min={0} value={p.eggLocation || 0} style={{ width: 140 }}
              onChange={(v) => set('eggLocation', v ?? 0)} />
          </div>
          <div>
            <div style={labelStyle}>{et('met.eggDate', '蛋日期')}</div>
            <DatePicker size="small" value={p.eggDate ? dayjs(p.eggDate) : null} style={{ width: 150 }}
              onChange={(_, dateStr) => { p.eggDate = dateStr as string; ch(); }} />
          </div>
        </Space>
      )}

      {g === 2 && (
        <div style={{ marginTop: 8 }}>
          <div style={labelStyle}>{et('met.metTimeOfDay', '相遇时间')}</div>
          <Select size="small" value={p.metTimeOfDay || 0} style={{ width: 140 }}
            onChange={(v) => set('metTimeOfDay', v)}
            options={[
              { value: 0, label: et('met.timeAny', '任何时间') }, { value: 1, label: et('met.timeMorning', '早晨') },
              { value: 2, label: et('met.timeDay', '白天') }, { value: 3, label: et('met.timeNight', '夜晚') },
            ]} />
        </div>
      )}

      {g === 4 && (
        <div style={{ marginTop: 8 }}>
          <div style={labelStyle}>{et('met.groundTile', '地面格子 (Ground Tile)')}</div>
          <InputNumber size="small" min={0} max={65535} value={p.groundTile || 0}
            onChange={(v) => set('groundTile', v ?? 0)} />
        </div>
      )}

      {g >= 8 && (
        <div style={{ marginTop: 8 }}>
          <div style={labelStyle}>{et('met.battleVersion', '对战版本')}</div>
          <InputNumber size="small" min={0} value={p.battleVersion || 0} style={{ width: 100 }}
            onChange={(v) => set('battleVersion', v ?? 0)} />
        </div>
      )}

      {g >= 9 && (
        <div style={{ marginTop: 8 }}>
          <div style={labelStyle}>{et('met.obedienceLevel', '服从等级')}</div>
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
            label: et('met.encounterSearch', '🔍 遭遇搜索'),
            forceRender: true,
            children: (
              <div>
                <Space wrap style={{ marginBottom: 8 }}>
                  <Select
                    showSearch
                    size="small"
                    placeholder={et('met.selectSpecies', '选择物种')}
                    value={searchSpecies}
                    onChange={(v) => { setSearchSpecies(v); setSearchForm(0); }}
                    options={speciesOptions}
                    style={{ width: 200 }}
                    filterOption={(input, option) =>
                      (option?.label as string)?.toLowerCase().includes(input.toLowerCase())}
                  />
                  <InputNumber size="small" placeholder={et('met.form', '形态')} min={0} max={255}
                    value={searchForm} onChange={v => setSearchForm(v ?? 0)} style={{ width: 70 }} />
                  <InputNumber size="small" placeholder={et('met.levelMin', '最低等级')} min={1} max={100}
                    value={searchLevelMin} onChange={v => setSearchLevelMin(v ?? undefined)} style={{ width: 90 }} />
                  <span style={{ fontSize: 12, color: '#888' }}>—</span>
                  <InputNumber size="small" placeholder={et('met.levelMax', '最高等级')} min={1} max={100}
                    value={searchLevelMax} onChange={v => setSearchLevelMax(v ?? undefined)} style={{ width: 90 }} />
                  <Button size="small" type="primary" icon={<SearchOutlined />}
                    onClick={handleSearch} loading={searching}>{et('met.search', '搜索')}</Button>
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
