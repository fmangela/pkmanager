import React, { useState, useCallback, useEffect } from 'react';
import {
  Typography, Collapse, Row, Col, Select, InputNumber, Input, Button, Table,
  Segmented, Dropdown, Space, App, Tag, Empty,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { MenuProps } from 'antd';
import { SearchOutlined, ReloadOutlined, SaveOutlined, FolderOpenOutlined, DeleteOutlined, ExportOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { saveFileApi, type PokemonSearchRequest, type PokemonSearchItemDto, type PokemonDto } from '../../api/saveFile';
import { bankApi } from '../../api/bank';
import { useResourceStore } from '../../stores/resourceStore';
import PokemonSprite from '../PokemonSprite';
import { getStoredSpriteStyle } from '../../lib/spriteUrl';
import BankEditDrawer from '../bank/BankEditDrawer';
import ShowdownExportModal from './ShowdownExportModal';

const { Text } = Typography;

interface SavedFilter {
  name: string;
  filters: PokemonSearchRequest;
}

const STORAGE_KEY = 'pkmanager_search_filters';

function loadSavedFilters(): SavedFilter[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveSavedFilters(list: SavedFilter[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

interface Props {
  saveFileId: string;
  /** 存档搜索结果跳转到箱子/槽位 */
  onJumpToSlot: (boxIndex: number, slotIndex: number, isParty: boolean) => void;
}

const defaultFilters = (): PokemonSearchRequest => ({
  page: 1,
  pageSize: 50,
});

const SearchPanel: React.FC<Props> = ({ saveFileId, onJumpToSlot }) => {
  const { t } = useTranslation(['editor', 'messages', 'common']);
  const et = (key: string, defaultValue: string, options?: Record<string, unknown>) =>
    t(key, { ns: 'editor', defaultValue, ...(options ?? {}) });
  const ct = (key: string, defaultValue: string, options?: Record<string, unknown>) =>
    t(key, { ns: 'common', defaultValue, ...(options ?? {}) });
  const { message } = App.useApp();
  const {
    species: speciesList,
    natures,
    abilities,
    items,
    balls,
    moves: moveList,
    loadAll,
  } = useResourceStore();
  const spriteStyle = getStoredSpriteStyle();

  // ── 搜索范围 ──
  const [scope, setScope] = useState<'save' | 'bank'>('save');

  // ── 筛选条件 ──
  const [filters, setFilters] = useState<PokemonSearchRequest>(defaultFilters());

  // ── 结果 ──
  const [results, setResults] = useState<PokemonSearchItemDto[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  // ── BankEditDrawer ──
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerPokemon, setDrawerPokemon] = useState<PokemonDto | null>(null);
  const [drawerBankId, setDrawerBankId] = useState('');

  // ── 已保存筛选器 ──
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>(loadSavedFilters);

  // ── 批量导出 ──
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [rowCacheByKey, setRowCacheByKey] = useState<Record<string, PokemonSearchItemDto>>({});
  const [batchExportModalOpen, setBatchExportModalOpen] = useState(false);
  const [batchExportText, setBatchExportText] = useState('');
  const [batchExportLoading, setBatchExportLoading] = useState(false);

  const getRowKey = (row: PokemonSearchItemDto) => String(row.bankId ?? `${row.boxIndex}-${row.slotIndex}-${row.isParty}`);
  const clearSelection = useCallback(() => {
    setSelectedRowKeys([]);
    setRowCacheByKey({});
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadAll(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadAll]);

  // 物种选择器 options
  const speciesOptions = speciesList.map(s => ({ value: s.id, label: `#${s.id} ${s.name}` }));
  const natureOptions = natures.map(n => ({ value: n.id, label: n.name }));
  const abilityOptions = abilities.map(a => ({ value: a.id, label: a.name }));
  const itemOptions = items.map(i => ({ value: i.id, label: i.name }));
  const ballOptions = balls.map(b => ({ value: b.id, label: b.name }));
  const moveOptions = moveList.map(m => ({ value: m.id, label: m.name }));

  // 重置 filters 和结果
  const resetAll = useCallback(() => {
    setFilters(defaultFilters());
    setResults([]);
    setTotal(0);
    setPage(1);
    clearSelection();
  }, [clearSelection]);

  // 执行搜索
  const doSearch = useCallback(async (searchPage?: number) => {
    const p = searchPage ?? page;
    setLoading(true);
    try {
      const request: PokemonSearchRequest = { ...filters, page: p };
      const res = scope === 'save'
        ? await saveFileApi.searchSave(saveFileId, request)
        : await bankApi.searchBank(request);
      setResults(res.data.items);
      setTotal(res.data.total);
      setPage(res.data.page);
    } catch {
      message.error(et('search.searchFailed', '搜索失败'));
    } finally {
      setLoading(false);
    }
  }, [filters, page, scope, saveFileId, message, t]);

  // 搜索按钮
  const handleSearch = () => {
    clearSelection();
    setPage(1);
    doSearch(1);
  };

  // ── 触发器辅助 ──
  const setB = (key: keyof PokemonSearchRequest, val: boolean | undefined) =>
    setFilters(f => ({ ...f, [key]: val }));
  const setN = (key: keyof PokemonSearchRequest, val: number | undefined) =>
    setFilters(f => ({ ...f, [key]: val !== undefined && !Number.isNaN(val) ? val : undefined }));
  const setArr = (key: keyof PokemonSearchRequest, val: number[] | undefined) =>
    setFilters(f => ({ ...f, [key]: val?.length ? val : undefined }));
  const setS = (key: keyof PokemonSearchRequest, val: string | undefined) =>
    setFilters(f => ({ ...f, [key]: val || undefined }));

  // ── 保存 / 加载筛选器 ──
  const handleSaveFilter = () => {
    const name = prompt(et('search.filterNamePrompt', '筛选器名称:'));
    if (!name) return;
    const list = [...savedFilters.filter(f => f.name !== name), { name, filters: { ...filters } }];
    setSavedFilters(list);
    saveSavedFilters(list);
    message.success(et('search.filterSaved', '已保存「{{name}}」', { name }));
  };

  const handleLoadFilter = (name: string) => {
    const found = savedFilters.find(f => f.name === name);
    if (found) {
      setFilters({ ...found.filters });
      message.success(et('search.filterLoaded', '已加载「{{name}}」', { name }));
    }
  };

  const handleDeleteFilter = (name: string) => {
    const list = savedFilters.filter(f => f.name !== name);
    setSavedFilters(list);
    saveSavedFilters(list);
    message.success(et('search.filterDeleted', '已删除「{{name}}」', { name }));
  };

  const handleFilterMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'save') {
      handleSaveFilter();
    } else if (key.startsWith('load_')) {
      handleLoadFilter(key.slice(5));
    } else if (key.startsWith('del_')) {
      handleDeleteFilter(key.slice(4));
    }
  };

  const saveMenuItems: MenuProps['items'] = [
    { key: 'save', label: et('search.saveCurrentFilter', '保存当前筛选...'), icon: <SaveOutlined /> },
    ...(savedFilters.length > 0
      ? [{ type: 'divider' as const, key: 'd1' }]
      : []),
    ...savedFilters.map(f => ({
      key: `load_${f.name}`,
      label: (
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <span>{f.name}</span>
          <Button type="text" size="small" icon={<DeleteOutlined />}
            onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleDeleteFilter(f.name); }} />
        </Space>
      ),
    })),
  ];

  // ── BankEditDrawer 回调 ──
  const handleDrawerClose = () => {
    setDrawerOpen(false);
    setDrawerPokemon(null);
    setDrawerBankId('');
  };

  // ── 批量导出 ──
  const handleBatchExportShowdown = async () => {
    const items = selectedRowKeys
      .map(key => rowCacheByKey[String(key)])
      .filter((item): item is PokemonSearchItemDto => !!item?.pkmDataBase64);
    if (items.length === 0) { message.warning(et('search.noExportableEntries', '没有可导出的条目')); return; }
    setBatchExportLoading(true);
    try {
      const texts: string[] = [];
      for (const item of items) {
        const res = await saveFileApi.exportShowdown({
          pkmDataBase64: item.pkmDataBase64!,
        });
        texts.push(res.data);
      }
      setBatchExportText(texts.join('\n\n'));
      setBatchExportModalOpen(true);
    } catch (err: unknown) {
      message.error(getErrorMessage(err, et('search.batchExportFailed', '批量导出失败')));
    } finally { setBatchExportLoading(false); }
  };

  // ── 结果点击 ──
  const handleRowClick = async (record: PokemonSearchItemDto) => {
    if (scope === 'save' && record.boxIndex !== undefined && record.slotIndex !== undefined) {
      onJumpToSlot(record.boxIndex, record.slotIndex, record.isParty);
    } else if (scope === 'bank' && record.bankId) {
      try {
        const detailRes = await bankApi.getDetail(record.bankId);
        setDrawerPokemon(detailRes.data);
        setDrawerBankId(record.bankId);
        setDrawerOpen(true);
      } catch {
        message.error(et('search.loadBankDetailFailed', '加载银行详情失败'));
      }
    }
  };

  // ── 表格列 ──
  const columns: ColumnsType<PokemonSearchItemDto> = [
    {
      title: '', dataIndex: 'speciesId', key: 'sprite', width: 56,
      render: (id: number) => (
        <PokemonSprite speciesId={id} variant={spriteStyle} width={40} height={40} alt="" />
      ),
    },
    {
      title: et('search.colSpecies', '物种'), dataIndex: 'speciesName', key: 'species', width: 120,
    },
    {
      title: et('search.colNickname', '昵称'), dataIndex: 'nickname', key: 'nickname', width: 100,
      render: (n: string) => n || <Text type="secondary">—</Text>,
    },
    {
      title: 'Lv', dataIndex: 'level', key: 'level', width: 48,
    },
    {
      title: et('search.colLocation', '位置'), dataIndex: 'locationLabel', key: 'location', width: 130,
      render: (_: string, r: PokemonSearchItemDto) => {
        if (scope === 'bank') return <Tag>{et('search.bank', '银行')}</Tag>;
        if (!r.locationLabel) return <Text type="secondary">—</Text>;
        const color = r.isParty ? 'blue' : undefined;
        return <Tag color={color}>{r.locationLabel}</Tag>;
      },
    },
    {
      title: et('search.colNature', '性格'), dataIndex: 'natureName', key: 'nature', width: 70,
    },
    {
      title: et('search.colAbility', '特性'), dataIndex: 'abilityName', key: 'ability', width: 90,
    },
    {
      title: et('search.colItem', '道具'), dataIndex: 'heldItemName', key: 'item', width: 90,
      render: (n: string | undefined) => n ? <Tag style={{ margin: 0 }}>{n}</Tag> : <Text type="secondary">—</Text>,
    },
    {
      title: '', dataIndex: 'isShiny', key: 'shiny', width: 40,
      render: (s: boolean) => s ? <span style={{ color: '#faad14', fontSize: 14 }}>✦</span> : null,
    },
    {
      title: '', dataIndex: 'isValid', key: 'validity', width: 40,
      render: (v: boolean | undefined) => {
        if (v === undefined) return null;
        return v
          ? <span style={{ color: '#52c41a', fontSize: 12 }}>✓</span>
          : <span style={{ color: '#ff4d4f', fontSize: 12 }}>✗</span>;
      },
    },
  ];

  return (
    <div style={{ padding: 12, background: 'var(--bg-surface, #fff)', borderRadius: 8, margin: 12, border: '1px solid var(--border-color, #e8e8e8)' }}>
      {/* ── 搜索范围 ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <Segmented
          value={scope}
          onChange={(v) => {
            setScope(v as 'save' | 'bank');
            setResults([]);
            setTotal(0);
            clearSelection();
          }}
          options={[
            { value: 'save', label: et('search.scopeSave', '当前存档') },
            { value: 'bank', label: et('search.scopeBank', '银行') },
          ]}
        />
        <Dropdown menu={{ items: saveMenuItems, onClick: handleFilterMenuClick }} trigger={['click']}>
          <Button icon={<FolderOpenOutlined />}>{et('search.filters', '筛选器')}</Button>
        </Dropdown>
      </div>

      {/* ── 筛选面板 ── */}
      <Collapse size="small" ghost items={[
        {
          key: 'basic', label: et('search.basic', '基础筛选'),
          children: (
            <Row gutter={[12, 8]}>
              <Col xs={24} sm={12} md={8}>
                <Text type="secondary" style={{ fontSize: 12 }}>{et('search.species', '物种')}</Text>
                <Select
                  allowClear showSearch
                  placeholder={et('search.any', '任意')}
                  style={{ width: '100%' }}
                  value={filters.speciesId}
                  onChange={(v) => setN('speciesId', v)}
                  options={speciesOptions}
                  filterOption={(input, option) =>
                    (option?.label as string)?.toLowerCase().includes(input.toLowerCase())}
                />
              </Col>
              <Col xs={12} sm={6} md={4}>
                <Text type="secondary" style={{ fontSize: 12 }}>{et('search.minLevel', '最低等级')}</Text>
                <InputNumber min={1} max={100} style={{ width: '100%' }}
                  value={filters.minLevel}
                  onChange={(v) => setN('minLevel', v ?? undefined)} />
              </Col>
              <Col xs={12} sm={6} md={4}>
                <Text type="secondary" style={{ fontSize: 12 }}>{et('search.maxLevel', '最高等级')}</Text>
                <InputNumber min={1} max={100} style={{ width: '100%' }}
                  value={filters.maxLevel}
                  onChange={(v) => setN('maxLevel', v ?? undefined)} />
              </Col>
              <Col xs={12} sm={6} md={4}>
                <Text type="secondary" style={{ fontSize: 12 }}>{et('search.shiny', '闪光')}</Text>
                <Select allowClear placeholder={et('search.unlimited', '不限')} style={{ width: '100%' }}
                  value={filters.isShiny}
                  onChange={(v) => setB('isShiny', v)}
                  options={[
                    { value: true, label: ct('yes', '是') },
                    { value: false, label: ct('no', '否') },
                  ]} />
              </Col>
              <Col xs={12} sm={6} md={4}>
                <Text type="secondary" style={{ fontSize: 12 }}>{et('search.egg', '蛋')}</Text>
                <Select allowClear placeholder={et('search.unlimited', '不限')} style={{ width: '100%' }}
                  value={filters.isEgg}
                  onChange={(v) => setB('isEgg', v)}
                  options={[
                    { value: true, label: ct('yes', '是') },
                    { value: false, label: ct('no', '否') },
                  ]} />
              </Col>
              <Col xs={12} sm={6} md={4}>
                <Text type="secondary" style={{ fontSize: 12 }}>{et('search.gender', '性别')}</Text>
                <Select allowClear placeholder={et('search.unlimited', '不限')} style={{ width: '100%' }}
                  value={filters.gender}
                  onChange={(v) => setN('gender', v)}
                  options={[
                    { value: 0, label: '♂' },
                    { value: 1, label: '♀' },
                    { value: 2, label: et('search.genderless', '无性别') },
                  ]} />
              </Col>
            </Row>
          ),
        },
        {
          key: 'nature-ability', label: et('search.natureAbilityItem', '性格 & 特性 & 道具'),
          children: (
            <Row gutter={[12, 8]}>
              <Col xs={24} sm={8}>
                <Text type="secondary" style={{ fontSize: 12 }}>{et('search.nature', '性格')}</Text>
                <Select allowClear showSearch placeholder={et('search.any', '任意')} style={{ width: '100%' }}
                  value={filters.nature}
                  onChange={(v) => setN('nature', v)}
                  options={natureOptions}
                  filterOption={(input, option) =>
                    (option?.label as string)?.toLowerCase().includes(input.toLowerCase())} />
              </Col>
              <Col xs={24} sm={8}>
                <Text type="secondary" style={{ fontSize: 12 }}>{et('search.ability', '特性')}</Text>
                <Select allowClear showSearch placeholder={et('search.any', '任意')} style={{ width: '100%' }}
                  value={filters.ability}
                  onChange={(v) => setN('ability', v)}
                  options={abilityOptions}
                  filterOption={(input, option) =>
                    (option?.label as string)?.toLowerCase().includes(input.toLowerCase())} />
              </Col>
              <Col xs={24} sm={8}>
                <Text type="secondary" style={{ fontSize: 12 }}>{et('search.heldItem', '持有物')}</Text>
                <Select allowClear showSearch placeholder={et('search.any', '任意')} style={{ width: '100%' }}
                  value={filters.heldItem}
                  onChange={(v) => setN('heldItem', v)}
                  options={itemOptions}
                  filterOption={(input, option) =>
                    (option?.label as string)?.toLowerCase().includes(input.toLowerCase())} />
              </Col>
              <Col xs={24} sm={8}>
                <Text type="secondary" style={{ fontSize: 12 }}>{et('search.ball', '球种')}</Text>
                <Select allowClear showSearch placeholder={et('search.any', '任意')} style={{ width: '100%' }}
                  value={filters.ball}
                  onChange={(v) => setN('ball', v)}
                  options={ballOptions}
                  filterOption={(input, option) =>
                    (option?.label as string)?.toLowerCase().includes(input.toLowerCase())} />
              </Col>
            </Row>
          ),
        },
        {
          key: 'stats', label: et('search.stats', '能力值 (IV / EV)'),
          children: (
            <Row gutter={[12, 8]}>
              <Col xs={24} sm={12} md={6}>
                <Text type="secondary" style={{ fontSize: 12 }}>{et('search.ivTotalMin', 'IV 合计(下限)')}</Text>
                <InputNumber min={0} max={186} style={{ width: '100%' }}
                  value={filters.minIVTotal}
                  onChange={(v) => setN('minIVTotal', v ?? undefined)} />
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Text type="secondary" style={{ fontSize: 12 }}>{et('search.ivTotalMax', 'IV 合计(上限)')}</Text>
                <InputNumber min={0} max={186} style={{ width: '100%' }}
                  value={filters.maxIVTotal}
                  onChange={(v) => setN('maxIVTotal', v ?? undefined)} />
              </Col>
              <Col xs={12} sm={8} md={4}>
                <Text type="secondary" style={{ fontSize: 12 }}>{et('search.ivHp', 'IV HP')}</Text>
                <div style={{ display: 'flex', gap: 4 }}>
                  <InputNumber size="small" min={0} max={31} placeholder="0" style={{ flex: 1 }}
                    value={filters.minIV_HP}
                    onChange={(v) => setN('minIV_HP', v ?? undefined)} />
                  <span style={{ lineHeight: '24px' }}>~</span>
                  <InputNumber size="small" min={0} max={31} placeholder="31" style={{ flex: 1 }}
                    value={filters.maxIV_HP}
                    onChange={(v) => setN('maxIV_HP', v ?? undefined)} />
                </div>
              </Col>
              <Col xs={12} sm={8} md={4}>
                <Text type="secondary" style={{ fontSize: 12 }}>{et('search.ivAtk', 'IV 攻击')}</Text>
                <div style={{ display: 'flex', gap: 4 }}>
                  <InputNumber size="small" min={0} max={31} placeholder="0" style={{ flex: 1 }}
                    value={filters.minIV_ATK}
                    onChange={(v) => setN('minIV_ATK', v ?? undefined)} />
                  <span style={{ lineHeight: '24px' }}>~</span>
                  <InputNumber size="small" min={0} max={31} placeholder="31" style={{ flex: 1 }}
                    value={filters.maxIV_ATK}
                    onChange={(v) => setN('maxIV_ATK', v ?? undefined)} />
                </div>
              </Col>
              <Col xs={12} sm={8} md={4}>
                <Text type="secondary" style={{ fontSize: 12 }}>{et('search.ivDef', 'IV 防御')}</Text>
                <div style={{ display: 'flex', gap: 4 }}>
                  <InputNumber size="small" min={0} max={31} placeholder="0" style={{ flex: 1 }}
                    value={filters.minIV_DEF}
                    onChange={(v) => setN('minIV_DEF', v ?? undefined)} />
                  <span style={{ lineHeight: '24px' }}>~</span>
                  <InputNumber size="small" min={0} max={31} placeholder="31" style={{ flex: 1 }}
                    value={filters.maxIV_DEF}
                    onChange={(v) => setN('maxIV_DEF', v ?? undefined)} />
                </div>
              </Col>
              <Col xs={12} sm={8} md={4}>
                <Text type="secondary" style={{ fontSize: 12 }}>{et('search.ivSpa', 'IV 特攻')}</Text>
                <div style={{ display: 'flex', gap: 4 }}>
                  <InputNumber size="small" min={0} max={31} placeholder="0" style={{ flex: 1 }}
                    value={filters.minIV_SPA}
                    onChange={(v) => setN('minIV_SPA', v ?? undefined)} />
                  <span style={{ lineHeight: '24px' }}>~</span>
                  <InputNumber size="small" min={0} max={31} placeholder="31" style={{ flex: 1 }}
                    value={filters.maxIV_SPA}
                    onChange={(v) => setN('maxIV_SPA', v ?? undefined)} />
                </div>
              </Col>
              <Col xs={12} sm={8} md={4}>
                <Text type="secondary" style={{ fontSize: 12 }}>{et('search.ivSpd', 'IV 特防')}</Text>
                <div style={{ display: 'flex', gap: 4 }}>
                  <InputNumber size="small" min={0} max={31} placeholder="0" style={{ flex: 1 }}
                    value={filters.minIV_SPD}
                    onChange={(v) => setN('minIV_SPD', v ?? undefined)} />
                  <span style={{ lineHeight: '24px' }}>~</span>
                  <InputNumber size="small" min={0} max={31} placeholder="31" style={{ flex: 1 }}
                    value={filters.maxIV_SPD}
                    onChange={(v) => setN('maxIV_SPD', v ?? undefined)} />
                </div>
              </Col>
              <Col xs={12} sm={8} md={4}>
                <Text type="secondary" style={{ fontSize: 12 }}>{et('search.ivSpe', 'IV 速度')}</Text>
                <div style={{ display: 'flex', gap: 4 }}>
                  <InputNumber size="small" min={0} max={31} placeholder="0" style={{ flex: 1 }}
                    value={filters.minIV_SPE}
                    onChange={(v) => setN('minIV_SPE', v ?? undefined)} />
                  <span style={{ lineHeight: '24px' }}>~</span>
                  <InputNumber size="small" min={0} max={31} placeholder="31" style={{ flex: 1 }}
                    value={filters.maxIV_SPE}
                    onChange={(v) => setN('maxIV_SPE', v ?? undefined)} />
                </div>
              </Col>
            </Row>
          ),
        },
        {
          key: 'moves', label: et('search.moves', '招式'),
          children: (
            <Row gutter={[12, 8]}>
              <Col xs={24}>
                <Text type="secondary" style={{ fontSize: 12 }}>{et('search.requiredMoves', '必须拥有 (ALL — 全部招式都必须拥有)')}</Text>
                <Select mode="multiple" allowClear showSearch placeholder={et('search.any', '任意')}
                  style={{ width: '100%' }}
                  value={filters.requiredMoves}
                  onChange={(v) => setArr('requiredMoves', v as number[])}
                  options={moveOptions}
                  filterOption={(input, option) =>
                    (option?.label as string)?.toLowerCase().includes(input.toLowerCase())} />
              </Col>
              <Col xs={24}>
                <Text type="secondary" style={{ fontSize: 12 }}>{et('search.anyMoves', '拥有任一 (ANY — 拥有其中任意一个即可)')}</Text>
                <Select mode="multiple" allowClear showSearch placeholder={et('search.any', '任意')}
                  style={{ width: '100%' }}
                  value={filters.anyMoves}
                  onChange={(v) => setArr('anyMoves', v as number[])}
                  options={moveOptions}
                  filterOption={(input, option) =>
                    (option?.label as string)?.toLowerCase().includes(input.toLowerCase())} />
              </Col>
            </Row>
          ),
        },
        {
          key: 'trainer', label: et('search.trainer', '训练家'),
          children: (
            <Row gutter={[12, 8]}>
              <Col xs={24} sm={12}>
                <Text type="secondary" style={{ fontSize: 12 }}>{et('search.otName', 'OT 名称')}</Text>
                <Input placeholder={et('search.trainerNamePlaceholder', '训练家名称')} allowClear
                  value={filters.ot_Name}
                  onChange={(e) => setS('ot_Name', e.target.value)} />
              </Col>
              <Col xs={24} sm={12}>
                <Text type="secondary" style={{ fontSize: 12 }}>TID (16-bit)</Text>
                <InputNumber min={0} max={65535} style={{ width: '100%' }}
                  value={filters.tid}
                  onChange={(v) => setN('tid', v ?? undefined)} />
              </Col>
            </Row>
          ),
        },
        ...(scope === 'bank' ? [{
          key: 'legality', label: et('search.legality', '合法性'),
          children: (
            <Row gutter={[12, 8]}>
              <Col xs={12} sm={6}>
                <Select allowClear placeholder={et('search.unlimited', '不限')} style={{ width: '100%' }}
                  value={filters.isLegal}
                  onChange={(v) => setB('isLegal', v)}
                  options={[
                    { value: true, label: et('legality.legal', '合法') },
                    { value: false, label: et('legality.illegal', '不合法') },
                  ]} />
              </Col>
            </Row>
          ),
        }] : []),
      ]} />

      {/* ── 搜索 / 重置 ── */}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch} loading={loading}>
          {et('search.searchButton', '搜索')}
        </Button>
        <Button icon={<ReloadOutlined />} onClick={resetAll}>{ct('reset', '重置')}</Button>
        {selectedRowKeys.length > 0 && (
          <Button icon={<ExportOutlined />} loading={batchExportLoading}
            onClick={handleBatchExportShowdown}>
            {et('search.exportSelected', 'Showdown 导出 (已选 {{count}})', { count: selectedRowKeys.length })}
          </Button>
        )}
        <div style={{ flex: 1 }} />
        {total > 0 && <Text type="secondary">{et('search.totalResults', '共 {{count}} 个结果', { count: total })}</Text>}
      </div>

      {/* ── 结果表格 ── */}
      <div style={{ marginTop: 12 }}>
        {total === 0 && !loading ? (
          <Empty description={et('search.noResults', '暂无搜索结果 — 请设置筛选条件后点击「搜索」')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <Table<PokemonSearchItemDto>
            size="small"
            loading={loading}
            dataSource={results}
            columns={columns}
            rowKey={getRowKey}
            rowSelection={{
              selectedRowKeys,
              onChange: (keys, rows) => {
                setSelectedRowKeys(keys.map(String));
                setRowCacheByKey(prev => {
                  const next = { ...prev };
                  rows.forEach(row => {
                    next[getRowKey(row)] = row;
                  });
                  return next;
                });
              },
            }}
            pagination={{
              current: page,
              pageSize: filters.pageSize,
              total,
              showSizeChanger: false,
              showTotal: (count) => et('search.totalResults', '共 {{count}} 个结果', { count }),
              onChange: (p) => { void doSearch(p); },
            }}
            onRow={(record) => ({
              onClick: () => handleRowClick(record),
              style: { cursor: 'pointer' },
            })}
            scroll={{ x: 900 }}
          />
        )}
      </div>

      {/* ── Bank Edit Drawer (scope=bank) ── */}
      <BankEditDrawer
        open={drawerOpen}
        pokemon={drawerPokemon}
        bankId={drawerBankId}
        onClose={handleDrawerClose}
        onSaved={() => { handleDrawerClose(); doSearch(page); }}
      />

      {/* ── Batch Showdown Export ── */}
      <ShowdownExportModal
        open={batchExportModalOpen}
        showdownText={batchExportText}
        onClose={() => setBatchExportModalOpen(false)}
      />
    </div>
  );
};

export default SearchPanel;

function getErrorMessage(err: unknown, fallback: string): string {
  if (typeof err === 'object' && err && 'response' in err) {
    const response = (err as { response?: { data?: { message?: string } } }).response;
    return response?.data?.message || fallback;
  }
  return fallback;
}
