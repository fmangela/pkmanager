import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Typography, Button, App, Spin, Tag, Tooltip, Space, Popconfirm, Dropdown, Select,
  Tabs, Segmented,
} from 'antd';
import type { MenuProps } from 'antd';
import {
  SaveOutlined, DownloadOutlined, ArrowLeftOutlined, BankOutlined,
  SafetyCertificateOutlined, AppstoreOutlined, LeftOutlined, RightOutlined,
  StarFilled, SortAscendingOutlined, SunOutlined, MoonOutlined, DesktopOutlined,
  InboxOutlined, ShoppingOutlined, IdcardOutlined, BookOutlined, SearchOutlined, ToolOutlined,
} from '@ant-design/icons';
import {
  DndContext, DragOverlay, closestCenter, PointerSensor, useSensor, useSensors,
  useDraggable, useDroppable,
  type DragStartEvent, type DragEndEvent,
} from '@dnd-kit/core';
import { saveFileApi, type SaveFileDetail, type BoxSlotDto, type PokemonDto, type SaveBackupDto, type LegalityStatus, type SaveBoxSortBy } from '../api/saveFile';
import { useDiagnosticStore } from '../stores/diagnosticStore';
import { useTheme, type ThemeMode } from '../components/ThemeProvider';
import { bankApi, type BankListItem } from '../api/bank';
import EditPanel from '../components/editor/EditPanel';
import BagPanel from '../components/editor/BagPanel';
import TrainerPanel from '../components/editor/TrainerPanel';
import PokedexPanel from '../components/editor/PokedexPanel';
import GenToolsPanel from '../components/editor/GenToolsPanel';
import SearchPanel from '../components/editor/SearchPanel';
import AllBoxesModal from '../components/AllBoxesModal';
import { useAuthStore } from '../stores/authStore';
import GameCover from '../components/GameCover';
import PokemonSprite from '../components/PokemonSprite';
import { getStoredSpriteStyle, type SpriteStyle } from '../lib/spriteUrl';

const { Title, Text } = Typography;

// ── ID helpers ────────────────────────────────────────
const saveSlotId = (box: number, slot: number) => `save:${box}:${slot}`;
const bankItemId = (bankId: string) => `bank:${bankId}`;
const bankDropId = 'bank-drop-zone';
const parseSaveSlot = (id: string) => ({ boxIndex: +id.split(':')[1], slotIndex: +id.split(':')[2] });
const BOX_SORT_LABELS: Record<SaveBoxSortBy, string> = {
  species: '物种编号',
  level: '等级',
  shiny: '闪光优先',
  name: '名称',
};
const BOX_SORT_MENU_ITEMS: MenuProps['items'] = [
  { key: 'species', label: '按物种编号' },
  { key: 'level', label: '按等级' },
  { key: 'shiny', label: '闪光优先' },
  { key: 'name', label: '按名称' },
];

const tabLabel = (icon: React.ReactNode, label: string) => (
  <Space size={6} align="center" className="save-editor-tab-label">
    <span className="save-editor-tab-label__icon">{icon}</span>
    <span>{label}</span>
  </Space>
);

const getDownloadFileName = (contentDisposition?: string, fallback = 'save.sav') => {
  if (!contentDisposition) return fallback;

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const plainMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
  if (plainMatch?.[1]) return plainMatch[1];
  return fallback;
};

// ── Draggable Slot Component ─────────────────────────
const DraggableSlot: React.FC<{
  boxIndex: number; slot: BoxSlotDto; onPokemonClick?: (p: PokemonDto) => void;
  legalityStatus?: LegalityStatus;
  spriteStyle?: SpriteStyle;
  selected?: boolean;
}> = ({ boxIndex, slot, onPokemonClick, legalityStatus, spriteStyle, selected }) => {
  const slotId = saveSlotId(boxIndex, slot.slotIndex);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: slotId, disabled: slot.isEmpty });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: slotId });

  const p = slot.pokemon;
  const isEmpty = slot.isEmpty;

  // Legality dot color
  const legalityColor =
    legalityStatus === 'Legal' ? '#52c41a' :
    legalityStatus === 'Fishy' ? '#faad14' :
    legalityStatus === 'Illegal' ? '#ff4d4f' :
    undefined;
  const slotClassName = [
    'pokemon-slot-card',
    isEmpty ? 'is-empty' : '',
    isOver ? 'is-drop-target' : '',
    isDragging ? 'is-dragging' : '',
    selected ? 'is-selected' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      ref={(node) => { setNodeRef(node); setDropRef(node); }}
      className={slotClassName}
      style={legalityColor ? ({ '--slot-legality': legalityColor } as React.CSSProperties) : undefined}
      {...(!isEmpty ? { ...attributes, ...listeners } : {})}
      onClick={() => { if (!isEmpty && p && onPokemonClick) onPokemonClick(p); }}
    >
      {isEmpty ? (
        <Text type="secondary" className="pokemon-slot-card__slot-index">{slot.slotIndex + 1}</Text>
      ) : (
        <>
          <div className="pokemon-slot-card__sprite-shell">
            <PokemonSprite speciesId={p!.species} width={32} height={32}
              variant={spriteStyle}
            />
            {/* Alpha badge — top-left */}
            {p!.isAlpha && (
              <span className="pokemon-slot-card__badge pokemon-slot-card__badge--alpha" title="头目 (Alpha)">α</span>
            )}
            {/* Shiny star — top-right */}
            {p!.isShiny && (
              <StarFilled className="pokemon-slot-card__badge pokemon-slot-card__badge--shiny" title="闪光" />
            )}
            {/* Gmax badge — bottom-right */}
            {p!.canGigantamax && (
              <span className="pokemon-slot-card__badge pokemon-slot-card__badge--gmax" title="超极巨化">G</span>
            )}
            {/* Legality indicator dot — bottom-left (tri-color) */}
            {legalityColor && (
              <span className="pokemon-slot-card__legality" title={
                legalityStatus === 'Legal' ? '合法' :
                legalityStatus === 'Fishy' ? '可疑' : '不合法'
              } />
            )}
          </div>
          <div className="pokemon-slot-card__name">
            {p!.nickname || p!.speciesName}
          </div>
          <Tag color="blue" className="pokemon-slot-card__level">Lv.{p!.level}</Tag>
        </>
      )}
    </div>
  );
};

// ── Draggable Bank Item ──────────────────────────────
const DraggableBankItem: React.FC<{ pokemon: BankListItem; spriteStyle?: SpriteStyle }> = ({ pokemon, spriteStyle }) => {
  const id = bankItemId(pokemon.id);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id });
  const className = [
    'bank-pokemon-chip',
    pokemon.isShiny ? 'is-shiny' : '',
    isDragging ? 'is-dragging' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={className}
    >
      <PokemonSprite speciesId={pokemon.species} width={40} height={40}
        variant={spriteStyle}
      />
      <div className="bank-pokemon-chip__name">{pokemon.nickname || pokemon.speciesName}</div>
      <Tag color="blue" className="bank-pokemon-chip__level">Lv.{pokemon.level}</Tag>
    </div>
  );
};

// ── Droppable Bank Zone ──────────────────────────────
const DroppableBankZone: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { setNodeRef, isOver } = useDroppable({ id: bankDropId });

  return (
    <div
      ref={setNodeRef}
      className={`bank-drop-zone${isOver ? ' is-drop-target' : ''}`}
    >
      {children}
    </div>
  );
};

// ── Main Editor Page ─────────────────────────────────
const SaveEditor: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { mode: themeMode, setMode: setThemeMode } = useTheme();
  const [spriteStyle, setSpriteStyle] = useState<SpriteStyle>(getStoredSpriteStyle);

  const [saveData, setSaveData] = useState<SaveFileDetail | null>(null);
  const [activeBox, setActiveBox] = useState(0);
  const [bankPokemon, setBankPokemon] = useState<BankListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDrag, setActiveDrag] = useState<{ label: string; meta?: string } | null>(null);
  const [editingPokemon, setEditingPokemon] = useState<PokemonDto | null>(null);
  const [editingBoxIndex, setEditingBoxIndex] = useState<number | undefined>();
  const [editingSlotIndex, setEditingSlotIndex] = useState<number | undefined>();
  const [editingIsParty, setEditingIsParty] = useState(false);
  const [editPanelOpen, setEditPanelOpen] = useState(false);
  const [legalityScanning, setLegalityScanning] = useState(false);
  const [sortingCurrentBox, setSortingCurrentBox] = useState(false);
  const [sortingBoxes, setSortingBoxes] = useState(false);
  const [legalityMap, setLegalityMap] = useState<Record<string, LegalityStatus>>({});
  const [allBoxesOpen, setAllBoxesOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('boxes');

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [saveRes, bankRes] = await Promise.all([
        saveFileApi.getDetail(id),
        bankApi.list({ pageSize: 50 }),
      ]);
      setSaveData(saveRes.data);
      setBankPokemon(bankRes.data.items);
    } catch {
      message.error('加载存档数据失败');
    } finally {
      setLoading(false);
    }
  }, [id, message]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Keyboard: Left/Right arrow keys to navigate boxes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (editPanelOpen) return; // Don't navigate while editing
      if (e.key === 'ArrowLeft') setActiveBox(a => Math.max(0, a - 1));
      else if (e.key === 'ArrowRight') setActiveBox(a => Math.min((saveData?.boxes.length || 1) - 1, a + 1));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [saveData?.boxes.length, editPanelOpen]);

  // After saveData refreshes, update editingPokemon if the panel is open
  useEffect(() => {
    if (!editPanelOpen || !editingPokemon || !saveData) return;
    const species = editingPokemon.species;
    // Check party
    for (const s of saveData.party) {
      if (s.pokemon && s.pokemon.species === species && s.slotIndex === editingSlotIndex) {
        setEditingPokemon(s.pokemon);
        return;
      }
    }
    // Check boxes
    for (const box of saveData.boxes) {
      for (const s of box.slots) {
        if (s.pokemon && s.pokemon.id === editingPokemon.id && editingPokemon.id) {
          setEditingPokemon(s.pokemon);
          return;
        }
      }
    }
  }, [saveData]);

  const handleDragStart = (event: DragStartEvent) => {
    const activeId = String(event.active.id);
    if (activeId.startsWith('save:')) {
      const { boxIndex, slotIndex } = parseSaveSlot(activeId);
      const slot = saveData?.boxes[boxIndex]?.slots[slotIndex];
      const level = slot?.pokemon?.level;
      setActiveDrag({
        label: slot?.pokemon?.nickname || slot?.pokemon?.speciesName || '宝可梦',
        meta: `Box ${boxIndex + 1} · ${typeof level === 'number' ? `Lv.${level}` : `槽位 ${slotIndex + 1}`}`,
      });
    } else if (activeId.startsWith('bank:')) {
      const bankId = activeId.replace('bank:', '');
      const item = bankPokemon.find(p => p.id === bankId);
      setActiveDrag({
        label: item?.nickname || item?.speciesName || '宝可梦',
        meta: typeof item?.level === 'number' ? `银行库存 · Lv.${item.level}` : '银行库存',
      });
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDrag(null);
    if (!over || !id) return;

    const fromId = String(active.id);
    const toId = String(over.id);

    // Save → Bank
    if (fromId.startsWith('save:') && toId === bankDropId) {
      const { boxIndex, slotIndex } = parseSaveSlot(fromId);
      try {
        await bankApi.fromSave({ saveFileId: id, boxIndex, slotIndex });
        message.success('已存入银行');
        fetchData();
      } catch { message.error('操作失败'); }
      return;
    }

    // Bank → Save
    if (fromId.startsWith('bank:') && toId.startsWith('save:')) {
      const bankPokemonId = fromId.replace('bank:', '');
      const { boxIndex, slotIndex } = parseSaveSlot(toId);
      try {
        await bankApi.moveToSave(id, { bankPokemonId, targetBoxIndex: boxIndex, targetSlotIndex: slotIndex });
        message.success('已移入存档');
        fetchData();
      } catch { message.error('操作失败'); }
      return;
    }

    // Save → Save (internal move)
    if (fromId.startsWith('save:') && toId.startsWith('save:')) {
      const from = parseSaveSlot(fromId);
      const to = parseSaveSlot(toId);
      if (from.boxIndex === to.boxIndex && from.slotIndex === to.slotIndex) return;
      try {
        await saveFileApi.moveSlot(id, {
          fromBoxIndex: from.boxIndex, fromSlotIndex: from.slotIndex,
          toBoxIndex: to.boxIndex, toSlotIndex: to.slotIndex,
        });
        message.success('移动成功');
        fetchData();
      } catch { message.error('移动失败'); }
    }
  };

  const handleSave = async () => { if (!id) return; try { await saveFileApi.save(id); message.success('已创建备份'); } catch { message.error('创建备份失败'); } };
  const handleDownload = async () => {
    if (!id) return;
    try {
      const res = await saveFileApi.download(id);
      const blob = res.data as Blob;
      const fileName = getDownloadFileName(
        res.headers['content-disposition'],
        saveData?.filename || `save_${id}.sav`,
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      message.success(`已导出存档：${fileName}`);
    } catch {
      message.error('导出失败');
    }
  };
  const handleBatchLegalityScan = async () => {
    if (!id) return;
    setLegalityScanning(true);
    try {
      const res = await saveFileApi.batchLegalityReport(id);
      // Build legality map: slotId → status
      const map: Record<string, LegalityStatus> = {};
      for (const s of res.data.slots) {
        const slotKey = s.isParty ? `party-${s.slotIndex}` : `box-${s.boxIndex}-${s.slotIndex}`;
        map[slotKey] = s.status;
      }
      setLegalityMap(map);
      message.success(`扫描完成: ${res.data.total}只, ${res.data.legalCount}合法, ${res.data.fishyCount}可疑, ${res.data.illegalCount}不合法`);
    } catch { message.error('扫描失败'); }
    finally { setLegalityScanning(false); }
  };
  const handleSortBoxes = async (sortBy: SaveBoxSortBy) => {
    if (!id || sortingBoxes) return;
    if (editPanelOpen) {
      message.warning('请先关闭编辑面板后再排序');
      return;
    }

    setSortingBoxes(true);
    try {
      await saveFileApi.sortBoxes(id, sortBy);
      setLegalityMap({});
      await fetchData();
      message.success(`已按${BOX_SORT_LABELS[sortBy]}完成箱子排序`);
    } catch (err: any) {
      message.error(err?.response?.data?.message || '排序失败');
    } finally {
      setSortingBoxes(false);
    }
  };
  const handleSortCurrentBox = async (sortBy: SaveBoxSortBy) => {
    if (!id || sortingCurrentBox || !currentBox) return;
    if (editPanelOpen) {
      message.warning('请先关闭编辑面板后再排序');
      return;
    }

    setSortingCurrentBox(true);
    try {
      await saveFileApi.sortBox(id, currentBox.boxIndex, sortBy);
      setLegalityMap({});
      await fetchData();
      message.success(`已按${BOX_SORT_LABELS[sortBy]}完成当前箱排序`);
    } catch (err: any) {
      message.error(err?.response?.data?.message || '排序失败');
    } finally {
      setSortingCurrentBox(false);
    }
  };
  const sortMenu: MenuProps = {
    items: BOX_SORT_MENU_ITEMS,
    onClick: ({ key }) => { void handleSortBoxes(key as SaveBoxSortBy); },
  };
  const currentBoxSortMenu: MenuProps = {
    items: BOX_SORT_MENU_ITEMS,
    onClick: ({ key }) => { void handleSortCurrentBox(key as SaveBoxSortBy); },
  };

  const openPokemonFromLocation = useCallback((boxIndex: number, slotIndex: number, isParty: boolean) => {
    if (!saveData) return;

    if (isParty) {
      const slot = saveData.party[slotIndex];
      if (!slot?.pokemon) {
        message.warning('未找到对应的同行宝可梦');
        return;
      }

      setActiveTab('boxes');
      setEditingPokemon(slot.pokemon);
      setEditingBoxIndex(-1);
      setEditingSlotIndex(slotIndex);
      setEditingIsParty(true);
      setEditPanelOpen(true);
      return;
    }

    const slot = saveData.boxes[boxIndex]?.slots[slotIndex];
    if (!slot?.pokemon) {
      message.warning('未找到对应的箱子宝可梦');
      return;
    }

    setActiveTab('boxes');
    setActiveBox(boxIndex);
    setEditingPokemon(slot.pokemon);
    setEditingBoxIndex(boxIndex);
    setEditingSlotIndex(slotIndex);
    setEditingIsParty(false);
    setEditPanelOpen(true);
  }, [message, saveData]);

  const tabItems = useMemo(() => {
    const items: Array<{ key: string; label: React.ReactNode }> = [
      { key: 'boxes', label: tabLabel(<InboxOutlined />, '箱子') },
      { key: 'bag', label: tabLabel(<ShoppingOutlined />, '背包') },
      { key: 'trainer', label: tabLabel(<IdcardOutlined />, '训练家') },
      { key: 'pokedex', label: tabLabel(<BookOutlined />, '图鉴') },
      { key: 'search', label: tabLabel(<SearchOutlined />, '搜索') },
    ];
    // Gen7: 支持具体版本 30-33，以及历史复合版本 71/72；排除 LGPE 42/43/73
    const isGen7SMUSUM = saveData?.gameVersion != null
      && [30, 31, 32, 33, 71, 72].includes(saveData.gameVersion);
    if (saveData?.generation === 3 || saveData?.generation === 6 || isGen7SMUSUM) {
      items.push({ key: 'gen-tools', label: tabLabel(<ToolOutlined />, '专用工具') });
    }
    return items;
  }, [saveData?.generation, saveData?.gameVersion]);

  const isGenToolsTab = activeTab === 'gen-tools';
  const isGenToolsSupported = saveData?.generation === 3 || saveData?.generation === 6
    || (saveData?.gameVersion != null && [30, 31, 32, 33, 71, 72].includes(saveData.gameVersion));
  const visibleActiveTab = isGenToolsTab && !isGenToolsSupported ? 'boxes' : activeTab;

  if (!isAuthenticated) return <div className="save-editor-fallback">请先登录</div>;
  if (loading) return <div className="save-editor-fallback"><Spin size="large" /></div>;

  if (!saveData) {
    return (
      <div className="save-editor-fallback">
        <Title level={4}>存档不存在</Title>
        <Button onClick={() => navigate('/saves')}>返回</Button>
      </div>
    );
  }

  const currentBox = saveData.boxes[activeBox];
  const boxList = saveData.boxes;
  const currentBoxUsed = currentBox?.slots.filter(slot => !slot.isEmpty).length ?? 0;
  const partyCount = saveData.party.filter(slot => !slot.isEmpty).length;
  const legalitySummary = { total: 0, legal: 0, fishy: 0, illegal: 0 };

  Object.values(legalityMap).forEach((status) => {
    legalitySummary.total += 1;
    if (status === 'Legal') legalitySummary.legal += 1;
    if (status === 'Fishy') legalitySummary.fishy += 1;
    if (status === 'Illegal') legalitySummary.illegal += 1;
  });

  const legalityTone = legalitySummary.illegal > 0
    ? 'danger'
    : legalitySummary.fishy > 0
      ? 'warning'
      : legalitySummary.total > 0
        ? 'success'
        : 'neutral';
  const focusLabel = editingPokemon
    ? `${editingPokemon.nickname || editingPokemon.speciesName} · Lv.${editingPokemon.level}`
    : '未打开编辑面板';
  const overviewCards = [
    { label: '训练家', value: saveData.trainerName || '未知训练家', tone: 'neutral' },
    { label: '当前箱子', value: currentBox ? `${currentBox.boxName} · ${currentBoxUsed}/${currentBox.capacity}` : '未选择', tone: 'accent' },
    { label: '队伍状态', value: `${partyCount}/${saveData.party.length} 已上阵`, tone: 'success' },
    {
      label: '合法性扫描',
      value: legalitySummary.total > 0
        ? `${legalitySummary.legal} 合法 · ${legalitySummary.fishy} 可疑 · ${legalitySummary.illegal} 异常`
        : '尚未扫描',
      tone: legalityTone,
    },
    { label: '银行库存', value: `${bankPokemon.length} 只宝可梦`, tone: 'neutral' },
    { label: '编辑焦点', value: focusLabel, tone: editingPokemon ? 'accent' : 'neutral' },
  ] as const;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="save-editor-page">
        <div className="save-editor-shell">
          <section className="app-panel save-editor-hero">
            <div className="save-editor-hero__overview">
              <div className="save-editor-hero__heading">
                <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/saves')}>返回</Button>
                <div className="save-editor-hero__title-group">
                  <Text className="save-editor-hero__eyebrow">宝可梦编辑工作台</Text>
                  <Title level={3} className="save-editor-hero__title">{saveData.filename}</Title>
                  <div className="save-editor-hero__meta">
                    <GameCover
                      gameVersion={saveData.gameVersion}
                      size="small"
                      showPlatform={false}
                      style={{ minWidth: 0, minHeight: 0, padding: 0 }}
                    />
                    <span className="app-status-chip is-accent">Gen{saveData.generation}</span>
                    <span className="app-status-chip">{saveData.gameVersionName}</span>
                    {saveData.isModified && <span className="app-status-chip is-warning">已修改</span>}
                  </div>
                </div>
              </div>
              <div className="save-editor-overview-grid">
                {overviewCards.map((item) => (
                  <div key={item.label} className={`save-editor-metric is-${item.tone}`}>
                    <span className="save-editor-metric__label">{item.label}</span>
                    <span className="save-editor-metric__value">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="save-editor-hero__actions">
              <div className="save-editor-hero__action-row">
                <Tooltip title="手动创建备份">
                  <Button icon={<SaveOutlined />} onClick={handleSave}>备份</Button>
                </Tooltip>
                <Tooltip title="导出下载">
                  <Button icon={<DownloadOutlined />} onClick={handleDownload}>导出</Button>
                </Tooltip>
              </div>
              <div className="save-editor-hero__control-group">
                <span className="save-editor-hero__control-label">主题</span>
                <Segmented
                  size="small"
                  options={[
                    { value: 'light' as ThemeMode, icon: <SunOutlined /> },
                    { value: 'dark' as ThemeMode, icon: <MoonOutlined /> },
                    { value: 'system' as ThemeMode, icon: <DesktopOutlined /> },
                  ]}
                  value={themeMode}
                  onChange={(v) => setThemeMode(v as ThemeMode)}
                />
              </div>
              <div className="save-editor-hero__control-group">
                <span className="save-editor-hero__control-label">精灵图</span>
                <Segmented
                  size="small"
                  options={[
                    { value: 'game' as SpriteStyle, label: 'Game' },
                    { value: 'home' as SpriteStyle, label: 'Home' },
                  ]}
                  value={spriteStyle}
                  onChange={(v) => {
                    const style = v as SpriteStyle;
                    setSpriteStyle(style);
                    localStorage.setItem('pkmanager_sprite_style', style);
                  }}
                />
              </div>
            </div>
          </section>

          <section className="app-panel save-editor-tabs-shell">
            <Tabs
              className="save-editor-archive-tabs"
              activeKey={visibleActiveTab}
              onChange={setActiveTab}
              size="small"
              items={tabItems}
            />
          </section>

          {visibleActiveTab === 'boxes' && (
            <div className="save-editor-workbench">
              <section className="app-panel app-toolbar save-editor-toolbar">
                <div className="save-editor-toolbar__label-group">
                  <Text strong>箱子工具</Text>
                  <Text type="secondary">在存档、队伍与银行之间快速整理宝可梦。</Text>
                </div>
                <Select
                  size="small"
                  value={activeBox}
                  className="save-editor-toolbar__select"
                  onChange={setActiveBox}
                  options={boxList.map((box) => {
                    const used = box.slots.filter(slot => !slot.isEmpty).length;
                    return {
                      value: box.boxIndex,
                      label: `Box ${box.boxIndex + 1}: ${box.boxName} (${used}/${box.capacity})`,
                    };
                  })}
                />
                <div className="save-editor-toolbar__spacer" />
                <Tooltip title="扫描当前存档中所有箱子与队伍宝可梦的合法性">
                  <Button
                    icon={<SafetyCertificateOutlined />}
                    onClick={handleBatchLegalityScan}
                    loading={legalityScanning}
                  >
                    合法性扫描
                  </Button>
                </Tooltip>
                <Dropdown menu={sortMenu} trigger={['click']} disabled={sortingBoxes || saveData.boxes.length === 0}>
                  <Button icon={<SortAscendingOutlined />} loading={sortingBoxes}>全部排序</Button>
                </Dropdown>
              </section>

              <div className="save-editor-grid-layout">
                <aside className="app-panel save-editor-sidebar">
                  <div className="save-editor-panel-heading">
                    <Text strong>箱子列表</Text>
                    <Space size={4}>
                      <Button
                        size="small"
                        type="text"
                        icon={<LeftOutlined />}
                        disabled={activeBox === 0}
                        onClick={() => setActiveBox((value) => Math.max(0, value - 1))}
                      />
                      <Button
                        size="small"
                        type="text"
                        icon={<RightOutlined />}
                        disabled={activeBox >= boxList.length - 1}
                        onClick={() => setActiveBox((value) => Math.min(boxList.length - 1, value + 1))}
                      />
                    </Space>
                  </div>
                  <div className="save-editor-sidebar__list">
                    {boxList.map((box) => {
                      const count = box.slots.filter(slot => !slot.isEmpty).length;
                      return (
                        <button
                          key={box.boxIndex}
                          type="button"
                          className={`save-editor-box-list-item${activeBox === box.boxIndex ? ' is-active' : ''}`}
                          onClick={() => setActiveBox(box.boxIndex)}
                        >
                          <span className="save-editor-box-list-item__title">Box {box.boxIndex + 1}: {box.boxName}</span>
                          <span className="save-editor-box-list-item__meta">{count}/{box.capacity}</span>
                        </button>
                      );
                    })}
                  </div>
                  <Button
                    size="small"
                    type="dashed"
                    icon={<AppstoreOutlined />}
                    className="save-editor-sidebar__all-boxes"
                    onClick={() => setAllBoxesOpen(true)}
                  >
                    全部箱子
                  </Button>
                </aside>

                <section className="app-panel save-editor-grid-panel">
                  <div className="save-editor-panel-heading">
                    <div>
                      <Text strong>{currentBox?.boxName || `Box ${activeBox + 1}`}</Text>
                      <Text type="secondary" className="save-editor-panel-heading__meta">
                        {currentBoxUsed}/{currentBox?.capacity ?? 0} 已占用
                      </Text>
                    </div>
                    <Tooltip title="只对当前箱子内部排序，空槽位会排到末尾">
                      <Dropdown menu={currentBoxSortMenu} trigger={['click']} disabled={sortingCurrentBox || !currentBox}>
                        <Button size="small" icon={<SortAscendingOutlined />} loading={sortingCurrentBox}>当前箱排序</Button>
                      </Dropdown>
                    </Tooltip>
                  </div>
                  {currentBox && (
                    <div className="save-editor-slot-grid">
                      {currentBox.slots.map((slot) => {
                        const slotKey = `box-${activeBox}-${slot.slotIndex}`;
                        return (
                          <DraggableSlot
                            key={slot.slotIndex}
                            boxIndex={activeBox}
                            slot={slot}
                            legalityStatus={legalityMap[slotKey]}
                            spriteStyle={spriteStyle}
                            selected={editPanelOpen && !editingIsParty && editingBoxIndex === activeBox && editingSlotIndex === slot.slotIndex}
                            onPokemonClick={(pokemon) => {
                              setEditingPokemon(pokemon);
                              setEditingBoxIndex(activeBox);
                              setEditingSlotIndex(slot.slotIndex);
                              setEditingIsParty(false);
                              setEditPanelOpen(true);
                            }}
                          />
                        );
                      })}
                    </div>
                  )}
                </section>
              </div>

              <div className="save-editor-support-layout">
                {saveData.party && saveData.party.length > 0 && (
                  <section className="app-panel save-editor-party-panel">
                    <div className="save-editor-panel-heading">
                      <Text strong>随行宝可梦</Text>
                      <Text type="secondary" className="save-editor-panel-heading__meta">{partyCount}/{saveData.party.length} 在队</Text>
                    </div>
                    <div className="save-editor-party-grid">
                      {saveData.party.map((slot: BoxSlotDto) => (
                        <div key={slot.slotIndex} className="save-editor-party-grid__item">
                          {slot.isEmpty ? (
                            <div className="pokemon-slot-card is-empty pokemon-slot-card--party">
                              <Text type="secondary" className="pokemon-slot-card__slot-index">空</Text>
                            </div>
                          ) : (
                            <div
                              className={`pokemon-slot-card pokemon-slot-card--party${editPanelOpen && editingIsParty && editingSlotIndex === slot.slotIndex ? ' is-selected' : ''}`}
                              onClick={() => {
                                if (slot.pokemon) {
                                  setEditingPokemon(slot.pokemon);
                                  setEditingBoxIndex(-1);
                                  setEditingSlotIndex(slot.slotIndex);
                                  setEditingIsParty(true);
                                  setEditPanelOpen(true);
                                }
                              }}
                            >
                              <div className="pokemon-slot-card__sprite-shell">
                                <PokemonSprite speciesId={slot.pokemon!.species} width={32} height={32} variant={spriteStyle} />
                                {slot.pokemon!.isShiny && <StarFilled className="pokemon-slot-card__badge pokemon-slot-card__badge--shiny" title="闪光" />}
                              </div>
                              <div className="pokemon-slot-card__name">{slot.pokemon!.nickname || slot.pokemon!.speciesName}</div>
                              <Tag color="blue" className="pokemon-slot-card__level">Lv.{slot.pokemon!.level}</Tag>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                <section className="app-panel save-editor-bank-panel">
                  <div className="save-editor-panel-heading">
                    <Text strong><BankOutlined /> 我的银行</Text>
                    <Text type="secondary" className="save-editor-panel-heading__meta">{bankPokemon.length} 只已入库</Text>
                  </div>
                  <DroppableBankZone>
                    {bankPokemon.length === 0 ? (
                      <Text type="secondary" className="save-editor-bank-panel__empty">拖拽宝可梦到这里存入银行</Text>
                    ) : (
                      bankPokemon.map((pokemon) => <DraggableBankItem key={pokemon.id} pokemon={pokemon} spriteStyle={spriteStyle} />)
                    )}
                  </DroppableBankZone>
                </section>
              </div>

              <BackupSection saveFileId={id!} />
            </div>
          )}

          {visibleActiveTab === 'bag' && (
            <div className="app-panel save-editor-tab-surface">
              <BagPanel saveFileId={id!} />
            </div>
          )}

          {visibleActiveTab === 'trainer' && (
            <div className="app-panel save-editor-tab-surface">
              <TrainerPanel saveFileId={id!} />
            </div>
          )}

          {visibleActiveTab === 'pokedex' && (
            <div className="app-panel save-editor-tab-surface save-editor-tab-surface--flush">
              <PokedexPanel saveFileId={id!} />
            </div>
          )}

          {visibleActiveTab === 'gen-tools' && (
            <div className="save-editor-gen-tools">
              <GenToolsPanel key={id} saveFileId={id!} />
            </div>
          )}

          {activeTab === 'search' && id && saveData && (
            <div className="app-panel save-editor-tab-surface save-editor-tab-surface--flush">
              <SearchPanel
                saveFileId={id}
                onJumpToSlot={openPokemonFromLocation}
              />
            </div>
          )}
        </div>
      </div>

      <DragOverlay>
        {activeDrag ? (
          <div className="save-editor-drag-preview">
            <Text className="save-editor-drag-preview__label">{activeDrag.label}</Text>
            {activeDrag.meta && <Text type="secondary" className="save-editor-drag-preview__meta">{activeDrag.meta}</Text>}
          </div>
        ) : null}
      </DragOverlay>

      <EditPanel
        open={editPanelOpen}
        pokemon={editingPokemon}
        generation={saveData.generation}
        saveFileId={id}
        boxIndex={editingBoxIndex}
        slotIndex={editingSlotIndex}
        isParty={editingIsParty}
        boxCount={saveData.boxes.length}
        onClose={() => { setEditPanelOpen(false); setEditingPokemon(null); setEditingBoxIndex(undefined); setEditingSlotIndex(undefined); }}
        onSaved={fetchData}
      />

      <AllBoxesModal
        open={allBoxesOpen}
        onClose={() => setAllBoxesOpen(false)}
        boxes={saveData.boxes}
        legalityMap={legalityMap}
        activeBox={activeBox}
        saveFileId={id!}
        onSelectBox={(boxIdx) => setActiveBox(boxIdx)}
        onSwapped={fetchData}
        spriteStyle={spriteStyle}
      />
    </DndContext>
  );
};

// ── Backup Section ──────────────────────────────────
const BackupSection: React.FC<{ saveFileId: string }> = ({ saveFileId }) => {
  const [backups, setBackups] = useState<SaveBackupDto[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const { message } = App.useApp();

  const loadBackups = async () => {
    try {
      const r = await saveFileApi.listBackups(saveFileId);
      setBackups(r.data || []);
    } catch (err: any) {
      useDiagnosticStore.getState().log({
        category: 'api', level: 'error',
        message: '加载备份列表失败',
        stack: err?.message,
      });
    }
  };
  useEffect(() => { loadBackups(); }, [saveFileId]);

  const handleRestore = async (backupId: string) => {
    setLoading(backupId);
    try {
      await saveFileApi.restoreBackup(saveFileId, backupId);
      message.success('已从备份恢复！页面将刷新');
      setTimeout(() => window.location.reload(), 800);
    } catch { message.error('恢复失败'); }
    finally { setLoading(null); }
  };

  if (backups.length === 0) return null;

  return (
    <section className="app-panel save-editor-backup-panel">
      <div className="save-editor-panel-heading">
        <Text strong>存档备份</Text>
        <Text type="secondary" className="save-editor-panel-heading__meta">最近 5 次快照</Text>
      </div>
      <div className="save-editor-backup-grid">
        {backups.map((b, i) => (
          <div key={b.id} className={`save-editor-backup-card${i === 0 ? ' is-latest' : ''}`}>
            <div className="save-editor-backup-card__head">
              <div className="save-editor-backup-card__title">{b.label || '备份'}</div>
              {i === 0 && <Tag color="green">最新</Tag>}
            </div>
            <div className="save-editor-backup-card__meta">
              <div>🕐 {new Date(b.createdAt).toLocaleString('zh-CN')}</div>
              <div>🎮 {b.gameVersion || '—'}</div>
              <div>👤 {b.trainerName || '—'}</div>
              <div>📦 {b.pokemonCount} 只宝可梦 · {b.boxCount} 箱</div>
              <div>⏱ {b.playTime || '—'}</div>
            </div>
            <Popconfirm
              title="确定恢复到此备份？当前修改将丢失"
              onConfirm={() => handleRestore(b.id)}
              okText="恢复" cancelText="取消">
              <Button size="small" type="primary" danger loading={loading === b.id} block>
                恢复此备份
              </Button>
            </Popconfirm>
          </div>
        ))}
      </div>
    </section>
  );
};

export default SaveEditor;
