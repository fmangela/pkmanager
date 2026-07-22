import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Typography, Button, App, Spin, Tag, Tooltip, Space, Popconfirm, Dropdown, Select, Checkbox,
  Tabs, Segmented,
} from 'antd';
import type { MenuProps } from 'antd';
import { useTranslation } from 'react-i18next';
import {
  SaveOutlined, DownloadOutlined, ArrowLeftOutlined, BankOutlined,
  SafetyCertificateOutlined, AppstoreOutlined, LeftOutlined, RightOutlined,
  StarFilled, SortAscendingOutlined, SunOutlined, MoonOutlined, DesktopOutlined,
  InboxOutlined, ShoppingOutlined, IdcardOutlined, BookOutlined, SearchOutlined, ToolOutlined,
  GiftOutlined, PlusOutlined,
} from '@ant-design/icons';
import {
  DndContext, DragOverlay, closestCenter, PointerSensor, useSensor, useSensors,
  useDraggable, useDroppable,
  type DragStartEvent, type DragEndEvent,
} from '@dnd-kit/core';
import { saveFileApi, type SaveFileDetail, type BoxSlotDto, type PokemonDto, type SaveBackupDto, type LegalityStatus, type SaveBoxSortBy } from '../api/saveFile';
import type { ApiError } from '../api/axios';
import { useDiagnosticStore } from '../stores/diagnosticStore';
import { useTheme, type ThemeMode } from '../components/theme-context';
import { bankApi, type BankListItem } from '../api/bank';
import EditPanel from '../components/editor/EditPanel';
import CreatePokemonModal from '../components/editor/CreatePokemonModal';
import BagPanel from '../components/editor/BagPanel';
import TrainerPanel from '../components/editor/TrainerPanel';
import PokedexPanel from '../components/editor/PokedexPanel';
import GenToolsPanel from '../components/editor/GenToolsPanel';
import SearchPanel from '../components/editor/SearchPanel';
import MysteryGiftPanel from '../components/editor/MysteryGiftPanel';
import AllBoxesModal from '../components/AllBoxesModal';
import { useAuthStore } from '../stores/authStore';
import GameCover from '../components/GameCover';
import PokemonSprite from '../components/PokemonSprite';
import { getStoredSpriteStyle, type SpriteStyle } from '../lib/spriteUrl';
import { formatLocaleDateTime } from '../i18n/locale';

const { Title, Text } = Typography;

// ── ID helpers ────────────────────────────────────────
const saveSlotId = (box: number, slot: number) => `save:${box}:${slot}`;
const parseSaveSlot = (id: string) => ({ boxIndex: +id.split(':')[1], slotIndex: +id.split(':')[2] });

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
  onEmptySlotClick?: (boxIndex: number, slotIndex: number, isParty: boolean) => void;
  legalityStatus?: LegalityStatus;
  spriteStyle?: SpriteStyle;
  isEditSelected?: boolean;
  isMultiSelected?: boolean;
  showCheckbox?: boolean;
  onToggleSelect?: (boxIndex: number, slotIndex: number, shiftKey: boolean) => void;
}> = ({ boxIndex, slot, onPokemonClick, onEmptySlotClick, legalityStatus, spriteStyle, isEditSelected, isMultiSelected, showCheckbox, onToggleSelect }) => {
  const { t } = useTranslation(['pages', 'editor']);
  const slotId = saveSlotId(boxIndex, slot.slotIndex);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: slotId, disabled: slot.isEmpty });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: slotId });

  const p = slot.pokemon;
  const isEmpty = slot.isEmpty;
  const isSelected = isEditSelected || isMultiSelected;

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
    isSelected ? 'is-selected' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      ref={(node) => { setNodeRef(node); setDropRef(node); }}
      className={slotClassName}
      style={isEmpty
        ? { cursor: 'pointer', ...(legalityColor ? { '--slot-legality': legalityColor } as React.CSSProperties : {}) }
        : (legalityColor ? ({ '--slot-legality': legalityColor } as React.CSSProperties) : undefined)}
      {...(!isEmpty ? { ...attributes, ...listeners } : {})}
      onClick={() => {
        if (!isEmpty && p && onPokemonClick) onPokemonClick(p);
        if (isEmpty && onEmptySlotClick) onEmptySlotClick(boxIndex, slot.slotIndex, false);
      }}
    >
      {isEmpty ? (
        <Text type="secondary" className="pokemon-slot-card__slot-index pokemon-slot-card__slot-index--empty">
          <PlusOutlined style={{ fontSize: 16, opacity: 0.3 }} />
        </Text>
      ) : (
        <>
          {/* Multi-select checkbox */}
          {showCheckbox && (
            <div
              className="pokemon-slot-card__checkbox"
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <Checkbox
                checked={isMultiSelected ?? false}
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  onToggleSelect?.(boxIndex, slot.slotIndex, e.shiftKey);
                }}
              />
            </div>
          )}
          <div className="pokemon-slot-card__sprite-shell">
            <PokemonSprite speciesId={p!.species} width={32} height={32}
              variant={spriteStyle}
            />
            {/* Alpha badge — top-left */}
            {p!.isAlpha && (
              <span
                className="pokemon-slot-card__badge pokemon-slot-card__badge--alpha"
                title={t('saveEditor.alphaTitle', { ns: 'pages', defaultValue: 'Alpha' })}
              >
                α
              </span>
            )}
            {/* Shiny star — top-right */}
            {p!.isShiny && (
              <StarFilled
                className="pokemon-slot-card__badge pokemon-slot-card__badge--shiny"
                title={t('saveEditor.shinyTitle', { ns: 'pages', defaultValue: 'Shiny' })}
              />
            )}
            {/* Gmax badge — bottom-right */}
            {p!.canGigantamax && (
              <span
                className="pokemon-slot-card__badge pokemon-slot-card__badge--gmax"
                title={t('saveEditor.gmaxTitle', { ns: 'pages', defaultValue: 'Gigantamax' })}
              >
                G
              </span>
            )}
            {/* Legality indicator dot — bottom-left (tri-color) */}
            {legalityColor && (
              <span
                className="pokemon-slot-card__legality"
                title={
                  legalityStatus === 'Legal'
                    ? t('legality.legal', { ns: 'editor', defaultValue: 'Legal' })
                    : legalityStatus === 'Fishy'
                      ? t('legality.fishy', { ns: 'editor', defaultValue: 'Suspicious' })
                      : t('legality.illegal', { ns: 'editor', defaultValue: 'Illegal' })
                }
              />
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

// ── Static Bank Chip ─────────────────────────────────
const BankChip: React.FC<{ pokemon: BankListItem; spriteStyle?: SpriteStyle }> = ({ pokemon, spriteStyle }) => (
  <div className="bank-pokemon-chip">
    <PokemonSprite speciesId={pokemon.species} width={40} height={40} variant={spriteStyle} />
    <Text type="secondary" style={{ fontSize: 9, fontFamily: 'monospace', lineHeight: 1 }}>
      #{String(pokemon.species).padStart(3, '0')}
    </Text>
    <div className="bank-pokemon-chip__name">{pokemon.nickname || pokemon.speciesName}</div>
    <Tag color="blue" className="bank-pokemon-chip__level">Lv.{pokemon.level}</Tag>
  </div>
);

// ── Main Editor Page ─────────────────────────────────
const SaveEditor: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { t } = useTranslation(['pages', 'messages', 'common']);
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
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createTarget, setCreateTarget] = useState<{ boxIndex: number; slotIndex: number; isParty: boolean }>({ boxIndex: 0, slotIndex: 0, isParty: false });
  const [legalityScanning, setLegalityScanning] = useState(false);
  const [sortingCurrentBox, setSortingCurrentBox] = useState(false);
  const [sortingBoxes, setSortingBoxes] = useState(false);
  const [legalityMap, setLegalityMap] = useState<Record<string, LegalityStatus>>({});
  const [allBoxesOpen, setAllBoxesOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('boxes');

  // ── Multi-select state ─────────────────────────
  const [selectedSlots, setSelectedSlots] = useState<Set<string>>(new Set());
  const [lastSelectedSlotIndex, setLastSelectedSlotIndex] = useState<number | null>(null);
  const [batchSendingToBank, setBatchSendingToBank] = useState(false);
  const BOX_SORT_LABELS: Record<SaveBoxSortBy, string> = {
    species: t('saveEditor.boxSortSpecies', { ns: 'pages', defaultValue: '物种编号' }),
    level: t('saveEditor.boxSortLevel', { ns: 'pages', defaultValue: '等级' }),
    shiny: t('saveEditor.boxSortShiny', { ns: 'pages', defaultValue: '闪光优先' }),
    name: t('saveEditor.boxSortName', { ns: 'pages', defaultValue: '名称' }),
  };
  const BOX_SORT_MENU_ITEMS: MenuProps['items'] = [
    { key: 'species', label: t('saveEditor.boxSortSpecies', { ns: 'pages', defaultValue: '物种编号' }) },
    { key: 'level', label: t('saveEditor.boxSortLevel', { ns: 'pages', defaultValue: '等级' }) },
    { key: 'shiny', label: t('saveEditor.boxSortShiny', { ns: 'pages', defaultValue: '闪光优先' }) },
    { key: 'name', label: t('saveEditor.boxSortName', { ns: 'pages', defaultValue: '名称' }) },
  ];

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
      message.error(t('saveDataLoadFailed', { ns: 'messages', defaultValue: '加载存档数据失败' }));
    } finally {
      setLoading(false);
    }
  }, [id, message, t]);

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

  // Clear multi-select when switching boxes
  useEffect(() => {
    setSelectedSlots(new Set());
    setLastSelectedSlotIndex(null);
  }, [activeBox]);

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
      const boxLabel = t('bank.boxLabel', { ns: 'pages', defaultValue: 'Box {{index}}', index: boxIndex + 1 });
      setActiveDrag({
        label: slot?.pokemon?.nickname || slot?.pokemon?.speciesName || t('pokemon', { ns: 'common', defaultValue: '宝可梦' }),
        meta: `${boxLabel} · ${typeof level === 'number' ? `Lv.${level}` : t('saveEditor.dragSlot', { ns: 'pages', defaultValue: '槽位 {{slot}}', slot: slotIndex + 1 })}`,
      });
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDrag(null);
    if (!over || !id) return;

    const fromId = String(active.id);
    const toId = String(over.id);

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
        message.success(t('moveSuccess', { ns: 'messages', defaultValue: '移动成功' }));
        fetchData();
      } catch { message.error(t('moveFailed', { ns: 'messages', defaultValue: '移动失败' })); }
    }
  };

  // ── Multi-select helpers ──────────────────────────
  const isMultiSelected = useCallback((boxIndex: number, slotIndex: number) =>
    selectedSlots.has(saveSlotId(boxIndex, slotIndex)),
  [selectedSlots]);

  const toggleSlotSelect = useCallback((boxIndex: number, slotIndex: number, shiftKey: boolean) => {
    // 防御：空槽位不允许加入多选
    if (saveData?.boxes[boxIndex]?.slots[slotIndex]?.isEmpty) return;
    setSelectedSlots(prev => {
      const next = new Set(prev);
      const slotId = saveSlotId(boxIndex, slotIndex);

      if (shiftKey && lastSelectedSlotIndex !== null) {
        // Append non-empty slots in range between anchor and current
        const start = Math.min(lastSelectedSlotIndex, slotIndex);
        const end = Math.max(lastSelectedSlotIndex, slotIndex);
        for (let i = start; i <= end; i++) {
          const slot = saveData?.boxes[boxIndex]?.slots[i];
          if (slot && !slot.isEmpty) {
            next.add(saveSlotId(boxIndex, i));
          }
        }
      } else {
        // Toggle single slot
        if (next.has(slotId)) {
          next.delete(slotId);
        } else {
          next.add(slotId);
        }
      }

      return next;
    });
    setLastSelectedSlotIndex(slotIndex);
  }, [lastSelectedSlotIndex, saveData]);

  const handleBatchSendToBank = useCallback(async () => {
    if (!id || selectedSlots.size === 0) return;
    setBatchSendingToBank(true);
    try {
      const slots = Array.from(selectedSlots).map(sid => {
        const parsed = parseSaveSlot(sid);
        return { boxIndex: parsed.boxIndex, slotIndex: parsed.slotIndex };
      });
      const res = await bankApi.batchFromSave({ saveFileId: id, slots });
      const { movedCount, failedCount } = res.data;
      if (failedCount > 0) {
        message.warning(t('moveToBankBatchPartial', {
          ns: 'messages',
          defaultValue: 'Sent {{moved}} to bank, {{failed}} failed.',
          moved: movedCount,
          failed: failedCount,
        }));
      } else {
        message.success(t('moveToBankBatchSuccess', {
          ns: 'messages',
          defaultValue: 'Sent {{count}} Pokemon to bank.',
          count: movedCount,
        }));
      }
      setSelectedSlots(new Set());
      setLastSelectedSlotIndex(null);
      fetchData();
    } catch {
      message.error(t('operationFailed', { ns: 'messages', defaultValue: '操作失败' }));
    } finally {
      setBatchSendingToBank(false);
    }
  }, [id, selectedSlots, message, t, fetchData]);

  const handleSave = async () => { if (!id) return; try { await saveFileApi.save(id); message.success(t('backupCreated', { ns: 'messages', defaultValue: '已创建备份' })); } catch { message.error(t('backupCreateFailed', { ns: 'messages', defaultValue: '创建备份失败' })); } };
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
      message.success(`${t('export', { ns: 'common', defaultValue: '导出' })}: ${fileName}`);
    } catch {
      message.error(t('exportFailed', { ns: 'messages', defaultValue: '导出失败' }));
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
      message.success(t('saveEditor.scanComplete', {
        ns: 'pages',
        defaultValue: '扫描完成: {{total}}只, {{legal}}合法, {{fishy}}可疑, {{illegal}}不合法',
        total: res.data.total,
        legal: res.data.legalCount,
        fishy: res.data.fishyCount,
        illegal: res.data.illegalCount,
      }));
    } catch { message.error(t('saveEditor.scanFailed', { ns: 'pages', defaultValue: '扫描失败' })); }
    finally { setLegalityScanning(false); }
  };
  const handleSortBoxes = async (sortBy: SaveBoxSortBy) => {
    if (!id || sortingBoxes) return;
    if (editPanelOpen) {
      message.warning(t('closeEditPanelBeforeSort', { ns: 'messages', defaultValue: '请先关闭编辑面板后再排序' }));
      return;
    }

    setSortingBoxes(true);
    try {
      await saveFileApi.sortBoxes(id, sortBy);
      setLegalityMap({});
      await fetchData();
      message.success(t('saveEditor.sortBoxesDone', {
        ns: 'pages',
        defaultValue: '已按{{sort}}完成箱子排序',
        sort: BOX_SORT_LABELS[sortBy],
      }));
    } catch (err: unknown) {
      message.error((err as ApiError).response?.data?.message || t('sortFailed', { ns: 'messages', defaultValue: '排序失败' }));
    } finally {
      setSortingBoxes(false);
    }
  };
  const handleSortCurrentBox = async (sortBy: SaveBoxSortBy) => {
    if (!id || sortingCurrentBox || !currentBox) return;
    if (editPanelOpen) {
      message.warning(t('closeEditPanelBeforeSort', { ns: 'messages', defaultValue: '请先关闭编辑面板后再排序' }));
      return;
    }

    setSortingCurrentBox(true);
    try {
      await saveFileApi.sortBox(id, currentBox.boxIndex, sortBy);
      setLegalityMap({});
      await fetchData();
      message.success(t('saveEditor.sortCurrentBoxDone', {
        ns: 'pages',
        defaultValue: '已按{{sort}}完成当前箱排序',
        sort: BOX_SORT_LABELS[sortBy],
      }));
    } catch (err: unknown) {
      message.error((err as ApiError).response?.data?.message || t('sortFailed', { ns: 'messages', defaultValue: '排序失败' }));
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
        message.warning(t('slotNotFoundParty', { ns: 'messages', defaultValue: '未找到对应的同行宝可梦' }));
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
      message.warning(t('slotNotFoundBox', { ns: 'messages', defaultValue: '未找到对应的箱子宝可梦' }));
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
      { key: 'boxes', label: tabLabel(<InboxOutlined />, t('saveEditor.boxesTab', { ns: 'pages', defaultValue: '箱子' })) },
      { key: 'bag', label: tabLabel(<ShoppingOutlined />, t('saveEditor.bagTab', { ns: 'pages', defaultValue: '背包' })) },
      { key: 'trainer', label: tabLabel(<IdcardOutlined />, t('saveEditor.trainerTab', { ns: 'pages', defaultValue: '训练家' })) },
      { key: 'pokedex', label: tabLabel(<BookOutlined />, t('saveEditor.pokedexTab', { ns: 'pages', defaultValue: '图鉴' })) },
      { key: 'search', label: tabLabel(<SearchOutlined />, t('saveEditor.searchTab', { ns: 'pages', defaultValue: '搜索' })) },
    ];
    // Gen7: 支持具体版本 30-33，以及历史复合版本 71/72；排除 LGPE 42/43/73
    const isGen7SMUSUM = saveData?.gameVersion != null
      && [30, 31, 32, 33, 71, 72].includes(saveData.gameVersion);
    if (saveData?.generation === 3 || saveData?.generation === 6 || isGen7SMUSUM) {
      items.push({ key: 'gen-tools', label: tabLabel(<ToolOutlined />, t('saveEditor.genToolsTab', { ns: 'pages', defaultValue: '专用工具' })) });
    }
    // L.7 配信功能 — 仅 Gen6 (XY/ORAS) 与 Gen7 (SM/USUM) 存档支持 wonder card 注入
    if (saveData?.generation === 6 || isGen7SMUSUM) {
      items.push({ key: 'mystery-gift', label: tabLabel(<GiftOutlined />, t('saveEditor.mysteryGiftTab', { ns: 'pages', defaultValue: '配信' })) });
    }
    return items;
  }, [saveData?.generation, saveData?.gameVersion, t]);

  const isGenToolsTab = activeTab === 'gen-tools';
  const isGenToolsSupported = saveData?.generation === 3 || saveData?.generation === 6
    || (saveData?.gameVersion != null && [30, 31, 32, 33, 71, 72].includes(saveData.gameVersion));
  const isMysteryGiftTab = activeTab === 'mystery-gift';
  const isMysteryGiftSupported = saveData?.generation === 6
    || (saveData?.gameVersion != null && [30, 31, 32, 33, 71, 72].includes(saveData.gameVersion));
  const visibleActiveTab =
    (isGenToolsTab && !isGenToolsSupported) || (isMysteryGiftTab && !isMysteryGiftSupported)
      ? 'boxes'
      : activeTab;

  if (!isAuthenticated) return <div className="save-editor-fallback">{t('saveEditor.loginRequired', { ns: 'pages', defaultValue: '请先登录' })}</div>;
  if (loading) return <div className="save-editor-fallback"><Spin size="large" /></div>;

  if (!saveData) {
    return (
      <div className="save-editor-fallback">
        <Title level={4}>{t('saveEditor.saveMissing', { ns: 'pages', defaultValue: '存档不存在' })}</Title>
        <Button onClick={() => navigate('/saves')}>{t('back', { ns: 'common', defaultValue: '返回' })}</Button>
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
    : t('saveEditor.focusEmpty', { ns: 'pages', defaultValue: '未打开编辑面板' });
  const overviewCards = [
    { label: t('saveEditor.trainer', { ns: 'pages', defaultValue: '训练家' }), value: saveData.trainerName || t('unknown', { ns: 'common', defaultValue: '未知' }), tone: 'neutral' },
    { label: t('saveEditor.currentBox', { ns: 'pages', defaultValue: '当前箱子' }), value: currentBox ? `${currentBox.boxName} · ${currentBoxUsed}/${currentBox.capacity}` : t('unknown', { ns: 'common', defaultValue: '未知' }), tone: 'accent' },
    { label: t('saveEditor.partyStatus', { ns: 'pages', defaultValue: '队伍状态' }), value: t('saveEditor.partyInTeam', { ns: 'pages', defaultValue: '{{count}}/{{total}} 已上阵', count: partyCount, total: saveData.party.length }), tone: 'success' },
    {
      label: t('saveEditor.legalityScan', { ns: 'pages', defaultValue: '合法性扫描' }),
      value: legalitySummary.total > 0
        ? t('saveEditor.scanSummary', { ns: 'pages', defaultValue: '{{legal}} 合法 · {{fishy}} 可疑 · {{illegal}} 异常', legal: legalitySummary.legal, fishy: legalitySummary.fishy, illegal: legalitySummary.illegal })
        : t('saveEditor.notScanned', { ns: 'pages', defaultValue: '尚未扫描' }),
      tone: legalityTone,
    },
    { label: t('saveEditor.bankInventory', { ns: 'pages', defaultValue: '银行库存' }), value: t('saveEditor.bankCount', { ns: 'pages', defaultValue: '{{count}} 只宝可梦', count: bankPokemon.length }), tone: 'neutral' },
    { label: t('saveEditor.editFocus', { ns: 'pages', defaultValue: '编辑焦点' }), value: focusLabel, tone: editingPokemon ? 'accent' : 'neutral' },
  ] as const;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="save-editor-page">
        <div className="save-editor-shell">
          <section className="app-panel save-editor-hero">
            <div className="save-editor-hero__overview">
              <div className="save-editor-hero__heading">
                <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/saves')}>{t('back', { ns: 'common', defaultValue: '返回' })}</Button>
                <div className="save-editor-hero__title-group">
                  <Text className="save-editor-hero__eyebrow">{t('saveEditor.workbenchTitle', { ns: 'pages', defaultValue: '宝可梦编辑工作台' })}</Text>
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
                    {saveData.isModified && <span className="app-status-chip is-warning">{t('saveEditor.modified', { ns: 'pages', defaultValue: '已修改' })}</span>}
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
                <Tooltip title={t('saveEditor.backupTooltip', { ns: 'pages', defaultValue: '手动创建备份' })}>
                  <Button icon={<SaveOutlined />} onClick={handleSave}>{t('backup', { ns: 'common', defaultValue: '备份' })}</Button>
                </Tooltip>
                <Tooltip title={t('saveEditor.downloadTooltip', { ns: 'pages', defaultValue: '导出下载' })}>
                  <Button icon={<DownloadOutlined />} onClick={handleDownload}>{t('export', { ns: 'common', defaultValue: '导出' })}</Button>
                </Tooltip>
              </div>
              <div className="save-editor-hero__control-group">
                <span className="save-editor-hero__control-label">{t('saveEditor.theme', { ns: 'pages', defaultValue: '主题' })}</span>
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
                <span className="save-editor-hero__control-label">{t('saveEditor.spriteStyle', { ns: 'pages', defaultValue: '精灵图' })}</span>
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
                  <Text strong>{t('saveEditor.boxTools', { ns: 'pages', defaultValue: '箱子工具' })}</Text>
                  <Text type="secondary">{t('saveEditor.boxToolsHint', { ns: 'pages', defaultValue: '在存档、队伍与银行之间快速整理宝可梦。' })}</Text>
                </div>
                <Select
                  size="small"
                  value={activeBox}
                  className="save-editor-toolbar__select"
                  onChange={setActiveBox}
                  options={boxList
                    .filter((box) => box.boxIndex != null)
                    .map((box) => {
                      const used = box.slots.filter(slot => !slot.isEmpty).length;
                      return {
                        value: box.boxIndex,
                        label: `Box ${box.boxIndex + 1}: ${box.boxName} (${used}/${box.capacity})`,
                      };
                    })}
                />
                <div className="save-editor-toolbar__spacer" />
                <Tooltip title={t('saveEditor.legalityScanTooltip', { ns: 'pages', defaultValue: '扫描当前存档中所有箱子与队伍宝可梦的合法性' })}>
                  <Button
                    icon={<SafetyCertificateOutlined />}
                    onClick={handleBatchLegalityScan}
                    loading={legalityScanning}
                  >
                    {t('saveEditor.legalityScanButton', { ns: 'pages', defaultValue: '合法性扫描' })}
                  </Button>
                </Tooltip>
                <Dropdown menu={sortMenu} trigger={['click']} disabled={sortingBoxes || saveData.boxes.length === 0}>
                  <Button icon={<SortAscendingOutlined />} loading={sortingBoxes}>{t('saveEditor.sortAllBoxes', { ns: 'pages', defaultValue: '全部排序' })}</Button>
                </Dropdown>
              </section>

              {/* Batch action bar */}
              {selectedSlots.size > 0 && (
                <section className="app-panel" style={{ marginBottom: 16, background: '#e6f4ff', border: '1px solid #91caff', padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text strong>
                    {t('saveEditor.selectedSlotCount', { ns: 'pages', defaultValue: '{{count}} selected', count: selectedSlots.size })}
                  </Text>
                  <Space>
                    <Popconfirm
                      title={t('saveEditor.sendToBankConfirm', { ns: 'pages', defaultValue: 'Send {{count}} Pokemon to bank?', count: selectedSlots.size })}
                      onConfirm={handleBatchSendToBank}
                      okText={t('confirm', { ns: 'common', defaultValue: '确定' })}
                      cancelText={t('cancel', { ns: 'common', defaultValue: '取消' })}
                    >
                      <Button icon={<BankOutlined />} loading={batchSendingToBank}>
                        {t('saveEditor.sendToBank', { ns: 'pages', defaultValue: '发送到银行' })}
                      </Button>
                    </Popconfirm>
                    <Button onClick={() => { setSelectedSlots(new Set()); setLastSelectedSlotIndex(null); }}>
                      {t('saveEditor.clearSelection', { ns: 'pages', defaultValue: '清除选择' })}
                    </Button>
                  </Space>
                </section>
              )}

              <div className="save-editor-grid-layout">
                <aside className="app-panel save-editor-sidebar">
                  <div className="save-editor-panel-heading">
                    <Text strong>{t('saveEditor.boxList', { ns: 'pages', defaultValue: '箱子列表' })}</Text>
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
                    {t('saveEditor.allBoxes', { ns: 'pages', defaultValue: '全部箱子' })}
                  </Button>
                </aside>

                <section className="app-panel save-editor-grid-panel">
                  <div className="save-editor-panel-heading">
                    <div>
                      <Text strong>{currentBox?.boxName || `Box ${activeBox + 1}`}</Text>
                      <Text type="secondary" className="save-editor-panel-heading__meta">
                        {t('saveEditor.usedCapacity', { ns: 'pages', defaultValue: '{{used}}/{{total}} 已占用', used: currentBoxUsed, total: currentBox?.capacity ?? 0 })}
                      </Text>
                    </div>
                    <Tooltip title={t('saveEditor.sortCurrentBoxHint', { ns: 'pages', defaultValue: '只对当前箱子内部排序，空槽位会排到末尾' })}>
                      <Dropdown menu={currentBoxSortMenu} trigger={['click']} disabled={sortingCurrentBox || !currentBox}>
                        <Button size="small" icon={<SortAscendingOutlined />} loading={sortingCurrentBox}>{t('saveEditor.sortCurrentBox', { ns: 'pages', defaultValue: '当前箱排序' })}</Button>
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
                            isEditSelected={editPanelOpen && !editingIsParty && editingBoxIndex === activeBox && editingSlotIndex === slot.slotIndex}
                            isMultiSelected={isMultiSelected(activeBox, slot.slotIndex)}
                            showCheckbox={true}
                            onToggleSelect={toggleSlotSelect}
                            onPokemonClick={(pokemon) => {
                              setEditingPokemon(pokemon);
                              setEditingBoxIndex(activeBox);
                              setEditingSlotIndex(slot.slotIndex);
                              setEditingIsParty(false);
                              setEditPanelOpen(true);
                            }}
                            onEmptySlotClick={(boxIdx, slotIdx, isParty) => {
                              setCreateTarget({ boxIndex: boxIdx, slotIndex: slotIdx, isParty });
                              setCreateModalOpen(true);
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
                      <Text strong>{t('saveEditor.partyPokemon', { ns: 'pages', defaultValue: '随行宝可梦' })}</Text>
                      <Text type="secondary" className="save-editor-panel-heading__meta">{t('saveEditor.partyCount', { ns: 'pages', defaultValue: '{{count}}/{{total}} 在队', count: partyCount, total: saveData.party.length })}</Text>
                    </div>
                    <div className="save-editor-party-grid">
                      {saveData.party.map((slot: BoxSlotDto) => (
                        <div key={slot.slotIndex} className="save-editor-party-grid__item">
                          {slot.isEmpty ? (
                            slot.slotIndex === partyCount ? (
                              <div
                                className="pokemon-slot-card is-empty pokemon-slot-card--party"
                                style={{ cursor: 'pointer' }}
                                onClick={() => {
                                  setCreateTarget({ boxIndex: -1, slotIndex: slot.slotIndex, isParty: true });
                                  setCreateModalOpen(true);
                                }}
                              >
                                <Text type="secondary" className="pokemon-slot-card__slot-index">
                                  <PlusOutlined style={{ fontSize: 16, opacity: 0.3 }} />
                                </Text>
                              </div>
                            ) : (
                              <div className="pokemon-slot-card is-empty pokemon-slot-card--party">
                                <Text type="secondary" className="pokemon-slot-card__slot-index">
                                  <PlusOutlined style={{ fontSize: 16, opacity: 0.1 }} />
                                </Text>
                              </div>
                            )
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
                                {slot.pokemon!.isShiny && <StarFilled className="pokemon-slot-card__badge pokemon-slot-card__badge--shiny" title={t('saveEditor.shinyTitle', { ns: 'pages', defaultValue: '闪光' })} />}
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
                    <Text strong><BankOutlined /> {t('saveEditor.myBank', { ns: 'pages', defaultValue: '我的银行' })}</Text>
                    <Text type="secondary" className="save-editor-panel-heading__meta">{t('saveEditor.bankStoredCount', { ns: 'pages', defaultValue: '{{count}} 只已入库', count: bankPokemon.length })}</Text>
                  </div>
                  <div className="save-editor-bank-list">
                    {bankPokemon.length === 0 ? (
                      <Text type="secondary" className="save-editor-bank-panel__empty">{t('saveEditor.bankEmpty', { ns: 'pages', defaultValue: '银行中暂无宝可梦' })}</Text>
                    ) : (
                      bankPokemon.map((pokemon) => <BankChip key={pokemon.id} pokemon={pokemon} spriteStyle={spriteStyle} />)
                    )}
                  </div>
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

          {visibleActiveTab === 'mystery-gift' && (
            <div className="app-panel save-editor-tab-surface">
              <MysteryGiftPanel saveFileId={id!} />
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

      <CreatePokemonModal
        open={createModalOpen}
        saveFileId={id!}
        targetGameVersion={saveData.gameVersion}
        boxIndex={createTarget.boxIndex}
        slotIndex={createTarget.slotIndex}
        isParty={createTarget.isParty}
        onCancel={() => setCreateModalOpen(false)}
        onCreated={() => { setCreateModalOpen(false); fetchData(); }}
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
  const { t, i18n } = useTranslation(['pages', 'messages', 'common']);

  const loadBackups = async () => {
    try {
      const r = await saveFileApi.listBackups(saveFileId);
      setBackups(r.data || []);
    } catch (err: unknown) {
      useDiagnosticStore.getState().log({
        category: 'api', level: 'error',
        message: t('loadBackupsFailed', { ns: 'messages', defaultValue: '加载备份列表失败' }),
        stack: (err as ApiError).message,
      });
    }
  };
  useEffect(() => { void loadBackups(); }, [saveFileId]);

  const handleRestore = async (backupId: string) => {
    setLoading(backupId);
    try {
      await saveFileApi.restoreBackup(saveFileId, backupId);
      message.success(t('backupRestoreSuccessReload', { ns: 'messages', defaultValue: '已从备份恢复！页面将刷新' }));
      setTimeout(() => window.location.reload(), 800);
    } catch { message.error(t('restoreFailed', { ns: 'messages', defaultValue: '恢复失败' })); }
    finally { setLoading(null); }
  };

  if (backups.length === 0) return null;

  return (
    <section className="app-panel save-editor-backup-panel">
      <div className="save-editor-panel-heading">
        <Text strong>{t('saveEditor.backups', { ns: 'pages', defaultValue: '存档备份' })}</Text>
        <Text type="secondary" className="save-editor-panel-heading__meta">{t('saveEditor.backupsHint', { ns: 'pages', defaultValue: '最近 5 次快照' })}</Text>
      </div>
      <div className="save-editor-backup-grid">
        {backups.map((b, i) => (
          <div key={b.id} className={`save-editor-backup-card${i === 0 ? ' is-latest' : ''}`}>
            <div className="save-editor-backup-card__head">
              <div className="save-editor-backup-card__title">{b.label || t('saveEditor.backupDefaultLabel', { ns: 'pages', defaultValue: '备份' })}</div>
              {i === 0 && <Tag color="green">{t('latest', { ns: 'common', defaultValue: '最新' })}</Tag>}
            </div>
            <div className="save-editor-backup-card__meta">
              <div>🕐 {formatLocaleDateTime(b.createdAt, i18n.language)}</div>
              <div>🎮 {b.gameVersion || '—'}</div>
              <div>👤 {b.trainerName || '—'}</div>
              <div>📦 {b.pokemonCount} Pokémon · {b.boxCount} Boxes</div>
              <div>⏱ {b.playTime || '—'}</div>
            </div>
            <Popconfirm
              title={t('saveEditor.backupRestoreConfirm', { ns: 'pages', defaultValue: '确定恢复到此备份？当前修改将丢失' })}
              onConfirm={() => handleRestore(b.id)}
              okText={t('restore', { ns: 'common', defaultValue: '恢复' })} cancelText={t('cancel', { ns: 'common', defaultValue: '取消' })}>
              <Button size="small" type="primary" danger loading={loading === b.id} block>
                {t('saveEditor.restoreBackup', { ns: 'pages', defaultValue: '恢复此备份' })}
              </Button>
            </Popconfirm>
          </div>
        ))}
      </div>
    </section>
  );
};

export default SaveEditor;
