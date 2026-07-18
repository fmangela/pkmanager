import React, { useEffect, useState, useCallback } from 'react';
import {
  App, Button, Card, Col, Empty, Input, List, Popconfirm, Row, Select, Space, Spin, Tag,
  Tooltip, Typography,
} from 'antd';
import { GiftOutlined, DeleteOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import {
  listInjectedWonderCards,
  listAvailableWonderCards,
  injectWonderCard,
  removeWonderCard,
  clearAllWonderCards,
  type MysteryGiftSlotDto,
  type WonderCardDto,
} from '../../api/mysteryGift';
import { useResourceStore } from '../../stores/resourceStore';

const { Text } = Typography;

interface Props {
  saveFileId: string;
}

/** 简易精灵图占位 — 按物种 ID 生成稳定的 HSL 颜色，避免依赖 sprite 资源加载 */
const SpeciesIcon: React.FC<{ speciesId?: number; name?: string }> = ({ speciesId, name }) => {
  if (!speciesId) return <GiftOutlined style={{ fontSize: 24, color: '#999' }} />;
  const hue = (speciesId * 47) % 360;
  const color = `hsl(${hue}, 55%, 55%)`;
  const label = name?.[0] ?? `#${speciesId}`;
  return (
    <div style={{
      width: 32, height: 32, borderRadius: 4, background: color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 14, fontWeight: 'bold', color: '#fff', flexShrink: 0,
    }}>
      {label}
    </div>
  );
};

const MysteryGiftPanel: React.FC<Props> = ({ saveFileId }) => {
  const { t } = useTranslation(['editor', 'messages', 'common']);
  const et = useCallback((key: string, defaultValue: string, options?: Record<string, unknown>) =>
    t(key, { ns: 'editor', defaultValue, ...(options ?? {}) }), [t]);
  const { message } = App.useApp();
  const { getSpeciesName, getItemName } = useResourceStore();

  const [injected, setInjected] = useState<MysteryGiftSlotDto[]>([]);
  const [available, setAvailable] = useState<WonderCardDto[]>([]);
  const [loadingInjected, setLoadingInjected] = useState(false);
  const [loadingAvailable, setLoadingAvailable] = useState(false);
  const [injecting, setInjecting] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [language, setLanguage] = useState<string | undefined>(undefined);

  const fetchInjected = useCallback(async () => {
    setLoadingInjected(true);
    try {
      const data = await listInjectedWonderCards(saveFileId);
      setInjected(data);
    } catch (err) {
      message.error(et('mysteryGift.loadInjectedFailed', '加载已注入卡片失败'));
    } finally {
      setLoadingInjected(false);
    }
  }, [saveFileId, message, et]);

  const fetchAvailable = useCallback(async () => {
    setLoadingAvailable(true);
    try {
      const data = await listAvailableWonderCards(saveFileId, language);
      setAvailable(data);
    } catch (err) {
      message.error(et('mysteryGift.loadAvailableFailed', '加载可注入卡片失败'));
    } finally {
      setLoadingAvailable(false);
    }
  }, [saveFileId, language, message, et]);

  useEffect(() => {
    fetchInjected();
    fetchAvailable();
  }, [fetchInjected, fetchAvailable]);

  const handleInject = async (cardId: string) => {
    setInjecting(cardId);
    try {
      const result = await injectWonderCard(saveFileId, cardId);
      message.success(et('mysteryGift.injectSuccess', '已注入到槽位 {{slot}}', { slot: result.slot.slot }));
      await Promise.all([fetchInjected(), fetchAvailable()]);
    } catch (err) {
      message.error(et('mysteryGift.injectFailed', '注入失败'));
    } finally {
      setInjecting(null);
    }
  };

  const handleRemove = async (slot: number) => {
    try {
      await removeWonderCard(saveFileId, slot);
      message.success(et('mysteryGift.removeSuccess', '已移除槽位 {{slot}}', { slot }));
      await fetchInjected();
    } catch (err) {
      message.error(et('mysteryGift.removeFailed', '移除失败'));
    }
  };

  const handleClearAll = async () => {
    try {
      await clearAllWonderCards(saveFileId);
      message.success(et('mysteryGift.clearSuccess', '已清空全部 wonder card'));
      await fetchInjected();
    } catch (err) {
      message.error(et('mysteryGift.clearFailed', '清空失败'));
    }
  };

  const filteredAvailable = available.filter((c) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return c.title.toLowerCase().includes(s)
      || (c.description ?? '').toLowerCase().includes(s)
      || c.cardId.toString().includes(s);
  });

  return (
    <div className="mystery-gift-panel">
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={10}>
          <Card
            size="small"
            title={
              <Space>
                <GiftOutlined />
                <span>{et('mysteryGift.injectedTitle', '已注入 Wonder Card')}</span>
                <Tag color="blue">{injected.length}/24</Tag>
              </Space>
            }
            extra={
              <Space>
                <Tooltip title={et('mysteryGift.refresh', '刷新')}>
                  <Button size="small" icon={<ReloadOutlined />} onClick={fetchInjected} loading={loadingInjected} />
                </Tooltip>
                {injected.length > 0 && (
                  <Popconfirm
                    title={et('mysteryGift.clearAllConfirm', '确认清空全部？')}
                    onConfirm={handleClearAll}
                  >
                    <Button size="small" danger icon={<DeleteOutlined />}>
                      {et('mysteryGift.clearAll', '清空全部')}
                    </Button>
                  </Popconfirm>
                )}
              </Space>
            }
          >
            <Spin spinning={loadingInjected}>
              {injected.length === 0 ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={et('mysteryGift.injectedEmpty', '当前存档无已注入的 wonder card')}
                />
              ) : (
                <List
                  size="small"
                  dataSource={injected}
                  renderItem={(slot) => (
                    <List.Item
                      actions={[
                        <Popconfirm
                          key="remove"
                          title={et('mysteryGift.removeConfirm', '确认移除？')}
                          onConfirm={() => handleRemove(slot.slot)}
                        >
                          <Button
                            size="small"
                            danger
                            icon={<DeleteOutlined />}
                          >
                            {et('mysteryGift.remove', '移除')}
                          </Button>
                        </Popconfirm>,
                      ]}
                    >
                      <List.Item.Meta
                        avatar={
                          <SpeciesIcon
                            speciesId={slot.speciesId}
                            name={slot.speciesName}
                          />
                        }
                        title={
                          <Space>
                            <Text type="secondary">#{slot.cardId.toString().padStart(4, '0')}</Text>
                            <Text strong>{slot.title}</Text>
                          </Space>
                        }
                        description={
                          <Space size="small" wrap>
                            <Tag>槽 {slot.slot}</Tag>
                            <Tag color="purple">{slot.cardType}</Tag>
                            {slot.isEntity && slot.speciesId && (
                              <Tag color="green">
                                {et('mysteryGift.pokemon', '宝可梦')}: {slot.speciesName ?? getSpeciesName(slot.speciesId)}
                              </Tag>
                            )}
                            {slot.isItem && slot.itemId && (
                              <Tag color="orange">
                                {et('mysteryGift.item', '道具')}: {getItemName(slot.itemId)}
                              </Tag>
                            )}
                          </Space>
                        }
                      />
                    </List.Item>
                  )}
                />
              )}
            </Spin>
          </Card>
        </Col>

        <Col xs={24} lg={14}>
          <Card
            size="small"
            title={
              <Space>
                <GiftOutlined />
                <span>{et('mysteryGift.availableTitle', '可注入的 Wonder Card')}</span>
                <Tag color="blue">{filteredAvailable.length}</Tag>
              </Space>
            }
            extra={
              <Space>
                <Select
                  size="small"
                  allowClear
                  placeholder={et('mysteryGift.languageFilter', '语言')}
                  style={{ width: 120 }}
                  value={language}
                  onChange={(v) => setLanguage(v ?? undefined)}
                  options={[
                    { value: undefined, label: et('mysteryGift.langAuto', '自动') },
                    { value: 'zh-Hans', label: '简中' },
                    { value: 'zh-Hant', label: '繁中' },
                    { value: 'en', label: 'English' },
                    { value: 'ja', label: '日本語' },
                    { value: 'fr', label: 'Français' },
                    { value: 'it', label: 'Italiano' },
                    { value: 'de', label: 'Deutsch' },
                    { value: 'es', label: 'Español' },
                    { value: 'ko', label: '한국어' },
                  ]}
                />
                <Tooltip title={et('mysteryGift.refresh', '刷新')}>
                  <Button
                    size="small"
                    icon={<ReloadOutlined />}
                    onClick={fetchAvailable}
                    loading={loadingAvailable}
                  />
                </Tooltip>
              </Space>
            }
          >
            <Input.Search
              placeholder={et('mysteryGift.searchPlaceholder', '搜索卡片 ID、标题或描述')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ marginBottom: 12 }}
              allowClear
            />
            <Spin spinning={loadingAvailable}>
              {filteredAvailable.length === 0 ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={et('mysteryGift.availableEmpty', '无可注入的 wonder card')}
                />
              ) : (
                <List
                  size="small"
                  dataSource={filteredAvailable}
                  pagination={{ pageSize: 10, size: 'small' }}
                  renderItem={(card) => (
                    <List.Item
                      actions={[
                        <Button
                          key="inject"
                          type="primary"
                          size="small"
                          icon={<PlusOutlined />}
                          loading={injecting === card.id}
                          onClick={() => handleInject(card.id)}
                        >
                          {et('mysteryGift.inject', '注入')}
                        </Button>,
                      ]}
                    >
                      <List.Item.Meta
                        avatar={
                          <SpeciesIcon
                            speciesId={card.speciesId ?? undefined}
                            name={card.speciesId ? getSpeciesName(card.speciesId) : undefined}
                          />
                        }
                        title={
                          <Space>
                            <Text type="secondary">#{card.cardId.toString().padStart(4, '0')}</Text>
                            <Text strong>{card.title}</Text>
                            <Tag>{card.gameVersion}</Tag>
                            <Tag color="purple">{card.cardType}</Tag>
                            <Tag color="blue">{card.language}</Tag>
                          </Space>
                        }
                        description={
                          <Space size="small" wrap>
                            {card.description && (
                              <Text type="secondary">{card.description}</Text>
                            )}
                            {card.releaseDate && (
                              <Tag>{card.releaseDate}</Tag>
                            )}
                          </Space>
                        }
                      />
                    </List.Item>
                  )}
                />
              )}
            </Spin>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default MysteryGiftPanel;
