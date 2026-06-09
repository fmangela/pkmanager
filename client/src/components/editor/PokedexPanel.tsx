import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Progress, Button, Checkbox, Input, App, Spin, Typography,
  Pagination, Popconfirm, Space, Alert,
} from 'antd';
import { SearchOutlined, SaveOutlined, EyeOutlined, AimOutlined, ClearOutlined } from '@ant-design/icons';
import { saveFileApi, type PokedexDto, type PokedexEntryDto } from '../../api/saveFile';
import { useResourceStore } from '../../stores/resourceStore';

const { Text } = Typography;
const PAGE_SIZE = 100;

interface Props {
  saveFileId: string;
}

/** 单个图鉴条目的小格子 */
const DexCell: React.FC<{
  species: number;
  name: string;
  seen: boolean;
  caught: boolean;
  onSeenChange: (v: boolean) => void;
  onCaughtChange: (v: boolean) => void;
}> = ({ species, name, seen, caught, onSeenChange, onCaughtChange }) => {
  const dexNum = String(species).padStart(3, '0');
  return (
    <div style={{
      border: '1px solid #f0f0f0',
      borderRadius: 6,
      padding: '8px 10px',
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      background: caught ? '#f6ffed' : seen ? '#fffbe6' : '#fff',
      transition: 'background 0.2s',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text type="secondary" style={{ fontSize: 10, fontFamily: 'monospace' }}>#{dexNum}</Text>
      </div>
      <Text style={{ fontSize: 12, lineHeight: 1.3, minHeight: 16 }}>{name}</Text>
      <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
        <Checkbox
          checked={seen}
          onChange={e => onSeenChange(e.target.checked)}
          style={{ fontSize: 11 }}
        >
          <Text style={{ fontSize: 11 }}>见</Text>
        </Checkbox>
        <Checkbox
          checked={caught}
          disabled={!seen}
          onChange={e => onCaughtChange(e.target.checked)}
          style={{ fontSize: 11 }}
        >
          <Text style={{ fontSize: 11 }}>捕</Text>
        </Checkbox>
      </div>
    </div>
  );
};

const PokedexPanel: React.FC<Props> = ({ saveFileId }) => {
  const [data, setData] = useState<PokedexDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [batching, setBatching] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [dirty, setDirty] = useState(false);
  const [dirtyEntries, setDirtyEntries] = useState<Map<number, PokedexEntryDto>>(new Map());
  const { message } = App.useApp();
  const speciesList = useResourceStore(s => s.species);

  // ── 物种名称 Map: id → name（O(1) 查找，避免每次 render 做 Array.find）──
  const speciesNameMap = useMemo(
    () => new Map(speciesList.map(item => [item.id, item.name])),
    [speciesList],
  );

  // ── 加载 ──
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await saveFileApi.getPokedex(saveFileId);
      setData(res.data);
      setDirtyEntries(new Map());
      setDirty(false);
      setPage(1);
      setSearch('');
    } catch {
      message.error('加载图鉴数据失败');
    } finally {
      setLoading(false);
    }
  }, [saveFileId, message]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── 合并 entries → 当前生效的全量 Map ──
  const mergedEntries = useMemo(() => {
    if (!data) return new Map<number, PokedexEntryDto>();
    const m = new Map<number, PokedexEntryDto>();
    for (const e of data.entries) {
      m.set(e.species, { ...e });
    }
    // overlay dirty
    for (const [species, e] of dirtyEntries) {
      m.set(species, { ...e });
    }
    return m;
  }, [data, dirtyEntries]);

  // ── 可见范围 ──
  const visibleMax = useMemo(() => {
    if (!data) return 0;
    return data.visibleSpeciesMax > 0 ? data.visibleSpeciesMax : data.totalSpecies;
  }, [data]);

  // ── 可见条目（1..visibleMax）──
  const visibleEntries = useMemo(() => {
    const arr: PokedexEntryDto[] = [];
    for (let i = 1; i <= visibleMax; i++) {
      const e = mergedEntries.get(i);
      arr.push(e ?? { species: i, seen: false, caught: false });
    }
    return arr;
  }, [mergedEntries, visibleMax]);

  // ── 搜索过滤 ──
  const filteredEntries = useMemo(() => {
    if (!search.trim()) return visibleEntries;
    const q = search.trim().toLowerCase();
    return visibleEntries.filter(e => {
      if (String(e.species).includes(q)) return true;
      const name = speciesNameMap.get(e.species);
      if (name && name.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [visibleEntries, search, speciesNameMap]);

  // ── 从可见条目重算进度条（不直接使用 DTO 百分比）──
  const stats = useMemo(() => {
    const seen = visibleEntries.filter(e => e.seen).length;
    const caught = visibleEntries.filter(e => e.caught).length;
    return {
      seenCount: seen,
      caughtCount: caught,
      percentSeen: visibleEntries.length > 0 ? Math.round((seen / visibleEntries.length) * 1000) / 10 : 0,
      percentCaught: visibleEntries.length > 0 ? Math.round((caught / visibleEntries.length) * 1000) / 10 : 0,
    };
  }, [visibleEntries]);

  // ── 分页 ──
  const paginatedEntries = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredEntries.slice(start, start + PAGE_SIZE);
  }, [filteredEntries, page]);

  // 搜索切换时回首页
  useEffect(() => { setPage(1); }, [search]);

  // ── 单个 Checkbox 变更 ──
  const handleSeenChange = useCallback((species: number, seen: boolean) => {
    setDirtyEntries(prev => {
      const next = new Map(prev);
      const prevEntry = prev.get(species);
      const base = prevEntry ?? mergedEntries.get(species) ?? { species, seen: false, caught: false };
      const updated: PokedexEntryDto = { ...base, seen };
      if (!seen) updated.caught = false; // !seen ⇒ !caught
      next.set(species, updated);
      return next;
    });
    setDirty(true);
  }, [mergedEntries]);

  const handleCaughtChange = useCallback((species: number, caught: boolean) => {
    setDirtyEntries(prev => {
      const next = new Map(prev);
      const prevEntry = prev.get(species);
      const base = prevEntry ?? mergedEntries.get(species) ?? { species, seen: false, caught: false };
      const updated: PokedexEntryDto = { ...base, caught };
      if (caught) updated.seen = true; // caught ⇒ seen
      next.set(species, updated);
      return next;
    });
    setDirty(true);
  }, [mergedEntries]);

  // ── 保存（发送全量 entries）──
  const handleSave = useCallback(async () => {
    if (!data) return;
    setSaving(true);
    try {
      const fullEntries: PokedexEntryDto[] = [];
      for (const [species, entry] of mergedEntries) {
        fullEntries.push(entry);
      }
      await saveFileApi.savePokedex(saveFileId, { ...data, entries: fullEntries });
      setDirty(false);
      setDirtyEntries(new Map());
      message.success('图鉴已保存');
      // 回读确保一致性
      await fetchData();
    } catch {
      message.error('保存图鉴失败');
    } finally {
      setSaving(false);
    }
  }, [data, mergedEntries, saveFileId, message, fetchData]);

  // ── 批量操作 ──
  const handleBatch = useCallback(async (action: string) => {
    setBatching(action);
    try {
      const res = await saveFileApi.batchPokedex(saveFileId, action);
      setData(res.data);
      setDirtyEntries(new Map());
      setDirty(false);
      setPage(1);
      message.success(action === 'seenAll' ? '已全部标记为见过'
        : action === 'caughtAll' ? '已全部标记为见过并捕获'
        : '已全部清除');
    } catch {
      message.error('批量操作失败');
    } finally {
      setBatching(null);
    }
  }, [saveFileId, message]);

  // ── 不支持的面板 ──
  if (!loading && data && !data.isSupported) {
    return (
      <div style={{ padding: 24 }}>
        <Alert
          type="warning"
          showIcon
          message="暂不支持"
          description={data.unsupportedReason || '该存档的图鉴格式暂未支持'}
        />
      </div>
    );
  }

  // ── 加载中 ──
  if (loading) {
    return <div style={{ padding: 48, textAlign: 'center' }}><Spin size="large" tip="加载图鉴数据..." /></div>;
  }

  if (!data) return null;

  return (
    <div style={{ padding: 16 }}>
      {/* ── 进度条 ── */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <EyeOutlined style={{ color: '#52c41a' }} />
          <Text style={{ width: 40, fontSize: 13 }}>见过</Text>
          <Progress
            percent={stats.percentSeen}
            size="small"
            strokeColor="#52c41a"
            format={() => `${stats.seenCount}/${visibleEntries.length}`}
            style={{ flex: 1, marginBottom: 0 }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
          <AimOutlined style={{ color: '#1677ff' }} />
          <Text style={{ width: 40, fontSize: 13 }}>捕获</Text>
          <Progress
            percent={stats.percentCaught}
            size="small"
            strokeColor="#1677ff"
            format={() => `${stats.caughtCount}/${visibleEntries.length}`}
            style={{ flex: 1, marginBottom: 0 }}
          />
        </div>
      </div>

      {/* ── 工具栏 ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <Space>
          <Popconfirm title="确认将所有物种标记为「见过」？" onConfirm={() => handleBatch('seenAll')}>
            <Button size="small" icon={<EyeOutlined />} loading={batching === 'seenAll'}>全见过</Button>
          </Popconfirm>
          <Popconfirm title="确认将所有物种标记为「见过并捕获」？" onConfirm={() => handleBatch('caughtAll')}>
            <Button size="small" icon={<AimOutlined />} loading={batching === 'caughtAll'}>全捕获</Button>
          </Popconfirm>
          <Popconfirm title="确认清除所有图鉴数据？此操作不可撤销。" onConfirm={() => handleBatch('clearAll')}>
            <Button size="small" icon={<ClearOutlined />} danger loading={batching === 'clearAll'}>全清除</Button>
          </Popconfirm>
        </Space>
        <Space>
          <Input
            size="small"
            placeholder="搜索编号或名称..."
            prefix={<SearchOutlined />}
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: 180 }}
            allowClear
          />
          <Button
            type="primary"
            size="small"
            icon={<SaveOutlined />}
            loading={saving}
            danger={dirty}
            onClick={handleSave}
          >
            {dirty ? '保存 *' : '保存'}
          </Button>
        </Space>
      </div>

      {/* ── 网格 ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(6, 1fr)',
        gap: 6,
        marginBottom: 12,
      }}>
        {paginatedEntries.map(e => (
          <DexCell
            key={e.species}
            species={e.species}
            name={speciesNameMap.get(e.species) ?? `物种 #${e.species}`}
            seen={e.seen}
            caught={e.caught}
            onSeenChange={v => handleSeenChange(e.species, v)}
            onCaughtChange={v => handleCaughtChange(e.species, v)}
          />
        ))}
      </div>

      {/* ── 分页 ── */}
      {filteredEntries.length > PAGE_SIZE && (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <Pagination
            current={page}
            pageSize={PAGE_SIZE}
            total={filteredEntries.length}
            onChange={setPage}
            size="small"
            showSizeChanger={false}
          />
        </div>
      )}

      {/* ── 搜索结果提示 ── */}
      {search.trim() && (
        <div style={{ textAlign: 'center', marginTop: 4 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            搜索 "{search}" — 找到 {filteredEntries.length} 个结果
          </Text>
        </div>
      )}
    </div>
  );
};

export default PokedexPanel;
