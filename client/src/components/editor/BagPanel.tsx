import React, { useEffect, useState, useCallback } from 'react';
import {
  Tabs, InputNumber, Switch, Button, App, Spin, Select, Space, Typography, Tooltip,
} from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { saveFileApi, type BagDto, type BagItemDto } from '../../api/saveFile';
import { useResourceStore } from '../../stores/resourceStore';
import { getIntlLocale } from '../../i18n/locale';

const { Text } = Typography;

/** Augmented item with original slot position preserved through sort */
interface SlotItem extends BagItemDto {
  slotPos: number;
}

/** 道具彩色图标占位 — 取中文名称首字作为标签，按道具 ID 生成稳定的 HSL 颜色 */
const ItemIcon: React.FC<{ index: number; name: string }> = ({ index, name }) => {
  const hue = (index * 47) % 360;
  const color = `hsl(${hue}, 55%, 55%)`;
  const label = index > 0 ? (name.length > 0 ? name[0] : (index % 100).toString()) : '—';
  return (
    <div style={{
      width: 24, height: 24, borderRadius: 4, background: color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: label.length > 1 ? 9 : 11, fontWeight: 'bold', color: '#fff',
      flexShrink: 0,
    }}>
      {label}
    </div>
  );
};

interface Props {
  saveFileId: string;
}

const BagPanel: React.FC<Props> = ({ saveFileId }) => {
  const { t, i18n } = useTranslation(['editor', 'messages', 'common']);
  const et = useCallback((key: string, defaultValue: string, options?: Record<string, unknown>) =>
    t(key, { ns: 'editor', defaultValue, ...(options ?? {}) }), [t]);
  const ct = useCallback((key: string, defaultValue: string, options?: Record<string, unknown>) =>
    t(key, { ns: 'common', defaultValue, ...(options ?? {}) }), [t]);
  const POUCH_LABELS: Record<string, string> = {
    Items: et('bag.items', '道具'),
    Medicine: et('bag.medicine', '药品'),
    TMHMs: et('bag.tms', '技能机'),
    Berries: et('bag.berries', '树果'),
    Balls: et('bag.balls', '精灵球'),
    BattleItems: et('bag.battleItems', '战斗道具'),
    KeyItems: et('bag.keyItems', '重要物品'),
    ZCrystals: et('bag.zCrystals', 'Z纯晶'),
    Candy: et('bag.candy', '糖果'),
    Treasure: et('bag.treasure', '宝藏'),
    Ingredients: et('bag.ingredients', '食材'),
    PCItems: et('bag.pcItems', '电脑道具'),
    MailItems: et('bag.mail', '邮件'),
    FreeSpace: et('bag.freeSpace', '自由空间'),
    MegaStones: et('bag.megaStones', '超级石'),
  };
  const SORT_OPTIONS = [
    { value: 'index', label: et('bag.sortIndex', '按索引') },
    { value: 'name', label: et('bag.sortName', '按名称') },
    { value: 'count', label: et('bag.sortCount', '按数量') },
    { value: 'emptyLast', label: et('bag.sortEmptyLast', '空格排末尾') },
  ];
  const [bag, setBag] = useState<BagDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activePouch, setActivePouch] = useState<string>('');
  const [showEmpty, setShowEmpty] = useState(true);
  const [sortBy, setSortBy] = useState('index');

  const { message } = App.useApp();
  const { loadAll, getItemName } = useResourceStore();

  const fetchBag = useCallback(async () => {
    setLoading(true);
    try {
      const res = await saveFileApi.getBag(saveFileId);
      const data: BagDto = res.data;
      setBag(data);
    } catch {
      message.error(et('bag.loadFailed', '加载背包失败'));
    } finally {
      setLoading(false);
    }
  }, [saveFileId, message, et]);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => { fetchBag(); }, [fetchBag]);

  // Set initial active pouch when bag first loads
  useEffect(() => {
    if (bag && bag.pouches.length > 0 && !activePouch) {
      setActivePouch(bag.pouches[0].type);
    }
  }, [bag, activePouch]);

  const currentPouch = bag?.pouches.find(p => p.type === activePouch);

  // 构建带槽位位置的 item 列表，排序时保留 slotPos
  const locale = getIntlLocale(i18n.language);

  const slotItems: SlotItem[] = React.useMemo(() => {
    if (!currentPouch) return [];
    const items: SlotItem[] = currentPouch.items.map((it, i) => ({ ...it, slotPos: i }));
    switch (sortBy) {
      case 'name':
        items.sort((a, b) => {
          const na = a.index > 0 ? getItemName(a.index) : '';
          const nb = b.index > 0 ? getItemName(b.index) : '';
          return na.localeCompare(nb, locale);
        });
        break;
      case 'count':
        items.sort((a, b) => b.count - a.count);
        break;
      case 'emptyLast':
        items.sort((a, b) => {
          if (a.count === 0 && b.count > 0) return 1;
          if (b.count === 0 && a.count > 0) return -1;
          return a.index - b.index;
        });
        break;
      default: // index
        items.sort((a, b) => a.index - b.index);
        break;
    }
    return items;
  }, [currentPouch, sortBy, getItemName, locale]);

  const filteredItems = showEmpty ? slotItems : slotItems.filter(it => it.count > 0);

  // Update by original slot position — stable regardless of sort/filter
  const setItemCount = (slotPos: number, count: number) => {
    if (!bag || !currentPouch) return;
    const newPouches = bag.pouches.map(p => {
      if (p.type !== activePouch) return p;
      const newItems = [...p.items];
      if (slotPos < newItems.length) {
        newItems[slotPos] = { ...newItems[slotPos], count };
      }
      return { ...p, items: newItems };
    });
    setBag({ ...bag, pouches: newPouches });
  };

  const toggleFavorite = (slotPos: number) => {
    if (!bag || !currentPouch) return;
    const newPouches = bag.pouches.map(p => {
      if (p.type !== activePouch) return p;
      const newItems = [...p.items];
      if (slotPos < newItems.length) {
        newItems[slotPos] = { ...newItems[slotPos], isFavorite: !newItems[slotPos].isFavorite };
      }
      return { ...p, items: newItems };
    });
    setBag({ ...bag, pouches: newPouches });
  };

  const handleSave = async () => {
    if (!bag) return;
    setSaving(true);
    try {
      await saveFileApi.saveBag(saveFileId, bag);
      message.success(et('bag.saved', '背包已保存'));
    } catch {
      message.error(et('bag.saveFailed', '保存背包失败'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={{ padding: 48, textAlign: 'center' }}><Spin /></div>;
  if (!bag) return <div style={{ padding: 48, textAlign: 'center' }}><Text type="secondary">{et('bag.loadFailed', '加载背包失败')}</Text></div>;

  const cap = bag.capability;

  return (
    <div style={{ display: 'flex', gap: 16, minHeight: 400 }}>
      {/* 左侧 Pouch 类型 Tabs */}
      <div style={{ width: 140, flexShrink: 0 }}>
        <Tabs
          tabPosition="left"
          activeKey={activePouch}
          onChange={setActivePouch}
          items={bag.pouches.map(p => ({
            key: p.type,
            label: POUCH_LABELS[p.type] || p.type,
          }))}
          style={{ height: '100%' }}
        />
      </div>

      {/* 右侧道具网格 */}
      <div style={{ flex: 1 }}>
        {/* 工具栏 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <Text strong>{POUCH_LABELS[activePouch] || activePouch}</Text>
          <Text type="secondary">({et('bag.itemKinds', '{{count}} 种道具', { count: filteredItems.filter(it => it.count > 0).length })})</Text>
          <div style={{ flex: 1 }} />
          <Space>
            <Select
              size="small"
              value={sortBy}
              onChange={setSortBy}
              options={SORT_OPTIONS}
              style={{ width: 120 }}
            />
            <Switch
              size="small"
              checked={showEmpty}
              onChange={setShowEmpty}
              checkedChildren={et('bag.showEmpty', '空格')}
              unCheckedChildren={et('bag.showEmpty', '空格')}
            />
            <Button type="primary" size="small" icon={<SaveOutlined />}
              loading={saving} onClick={handleSave}>
              {ct('save', '保存')}
            </Button>
          </Space>
        </div>

        {/* 道具网格 */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: 6,
        }}>
          {filteredItems.map((item) => {
            const isEmpty = item.index === 0;
            const itemName = isEmpty ? '' : (getItemName(item.index) || `#${item.index}`);

            return (
              <div key={item.slotPos} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px',
                borderRadius: 6, border: '1px solid #f0f0f0',
                background: isEmpty ? '#fafafa' : '#fff',
                opacity: isEmpty ? 0.5 : 1,
              }}>
                {/* 图标 + 收藏/新物品标记 */}
                <div style={{ position: 'relative', width: 28, height: 28, flexShrink: 0 }}>
                  {!isEmpty && (
                    <>
                      <ItemIcon index={item.index} name={itemName} />
                      {cap.hasFavorite && (
                        <Tooltip title={item.isFavorite ? et('bag.favorite', '已收藏') : et('bag.notFavorite', '未收藏')}>
                          <span
                            onClick={() => toggleFavorite(item.slotPos)}
                            style={{
                              position: 'absolute', top: -2, right: -2,
                              fontSize: 10, cursor: 'pointer',
                              color: item.isFavorite ? '#faad14' : '#d9d9d9',
                              userSelect: 'none',
                            }}
                          >
                            ★
                          </span>
                        </Tooltip>
                      )}
                      {cap.hasNewFlag && item.isNew && (
                        <span style={{
                          position: 'absolute', bottom: -2, left: -2,
                          fontSize: 8, color: '#1677ff', fontWeight: 'bold',
                        }}>NEW</span>
                      )}
                    </>
                  )}
                </div>

                {/* 名称 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 12, lineHeight: 1.2, display: 'block' }}
                    ellipsis={{ tooltip: itemName }}>
                    {isEmpty ? '—' : itemName}
                  </Text>
                </div>

                {/* 数量 */}
                <InputNumber
                  size="small"
                  min={0}
                  max={999}
                  value={item.count}
                  onChange={(v) => setItemCount(item.slotPos, v ?? 0)}
                  style={{ width: 56 }}
                  disabled={isEmpty && !showEmpty}
                />
              </div>
            );
          })}
        </div>

        {filteredItems.length === 0 && (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Text type="secondary">{et('bag.emptyPouch', '此分类中无道具')}</Text>
          </div>
        )}
      </div>
    </div>
  );
};

export default BagPanel;
