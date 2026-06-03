import React, { useEffect, useState, useCallback } from 'react';
import { Card, Row, Col, Typography, Button, Modal, List, Tag, Spin } from 'antd';
import { useNavigate } from 'react-router-dom';
import { BankOutlined, SaveOutlined, PlayCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { saveFileApi, type SaveFileInfo } from '../api/saveFile';

const { Title, Text } = Typography;

// ── Game cover image with icon fallback ──
const GameCover: React.FC<{ gameId: string; color: string }> = ({ gameId, color }) => {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return <PlayCircleOutlined style={{ fontSize: 48, color, marginBottom: 16 }} />;
  }

  return (
    <img
      src={`/covers/${gameId}.png`}
      alt=""
      onError={() => setHasError(true)}
      style={{
        height: 140,
        width: 'auto',
        maxWidth: '100%',
        objectFit: 'contain',
        borderRadius: 6,
        marginBottom: 12,
        boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
      }}
    />
  );
};

// gameId → gameVersion 映射（GBA Gen3 + NDS Gen4/5）
const GAME_VERSION_MAP: Record<string, number> = {
  // GBA Gen3
  pkm_sapphire: 1, pkm_ruby: 2, pkm_emerald: 3,
  pkm_firered: 4, pkm_leafgreen: 5,
  // NDS Gen4
  pkm_diamond: 10, pkm_pearl: 11, pkm_platinum: 12,
  pkm_heartgold: 7, pkm_soulsilver: 8,
  // NDS Gen5 (PKHeX: W=20, B=21, W2=22, B2=23)
  pkm_white: 20, pkm_black: 21, pkm_white2: 22, pkm_black2: 23,
};

// 按真实发行日期排序（日本首发日）
const GAMES: { gameId: string; displayName: string; color: string; gameVersion: number; generation: number }[] = [
  { gameId: 'pkm_ruby', displayName: '宝可梦 红宝石', color: '#cf1322', gameVersion: 2, generation: 3 },
  { gameId: 'pkm_sapphire', displayName: '宝可梦 蓝宝石', color: '#0958d9', gameVersion: 1, generation: 3 },
  { gameId: 'pkm_firered', displayName: '宝可梦 火红', color: '#d4380d', gameVersion: 4, generation: 3 },
  { gameId: 'pkm_leafgreen', displayName: '宝可梦 叶绿', color: '#389e0d', gameVersion: 5, generation: 3 },
  { gameId: 'pkm_emerald', displayName: '宝可梦 绿宝石', color: '#08979c', gameVersion: 3, generation: 3 },
];

const NDS_GAMES: { gameId: string; displayName: string; color: string; gameVersion: number; generation: number }[] = [
  // Gen4 — 按发行日期排序
  { gameId: 'pkm_diamond', displayName: '宝可梦 钻石', color: '#5b8bd4', gameVersion: 10, generation: 4 },
  { gameId: 'pkm_pearl', displayName: '宝可梦 珍珠', color: '#e799b0', gameVersion: 11, generation: 4 },
  { gameId: 'pkm_platinum', displayName: '宝可梦 白金', color: '#b8b8b8', gameVersion: 12, generation: 4 },
  { gameId: 'pkm_heartgold', displayName: '宝可梦 心金', color: '#d4a017', gameVersion: 7, generation: 4 },
  { gameId: 'pkm_soulsilver', displayName: '宝可梦 魂银', color: '#8b9dc3', gameVersion: 8, generation: 4 },
  // Gen5 (PKHeX: White=20, Black=21, White2=22, Black2=23)
  { gameId: 'pkm_white', displayName: '宝可梦 白', color: '#e8e8e8', gameVersion: 20, generation: 5 },
  { gameId: 'pkm_black', displayName: '宝可梦 黑', color: '#1a1a1a', gameVersion: 21, generation: 5 },
  { gameId: 'pkm_white2', displayName: '宝可梦 白2', color: '#f0e6d3', gameVersion: 22, generation: 5 },
  { gameId: 'pkm_black2', displayName: '宝可梦 黑2', color: '#0d2137', gameVersion: 23, generation: 5 },
];

const DashboardPage: React.FC = () => {
  const navigate = useNavigate();

  // Modal state — selectedGame is null when closed
  const [selectedGame, setSelectedGame] = useState<{ gameId: string; displayName: string; generation: number } | null>(null);
  const [saves, setSaves] = useState<SaveFileInfo[]>([]);
  const [loadingSaves, setLoadingSaves] = useState(false);
  const fetchSaves = useCallback(async () => {
    setLoadingSaves(true);
    try {
      const res = await saveFileApi.list();
      setSaves(res.data || []);
    } catch {
      // 静默失败
    } finally {
      setLoadingSaves(false);
    }
  }, []);

  useEffect(() => {
    if (selectedGame) fetchSaves();
  }, [selectedGame, fetchSaves]);

  const gameVersion = selectedGame ? GAME_VERSION_MAP[selectedGame.gameId] : undefined;
  const matchingSaves = saves.filter(s => s.gameVersion === gameVersion);
  const isNds = selectedGame ? selectedGame.generation >= 4 : false;

  const handleSelectSave = (saveFileId: string) => {
    setSelectedGame(null);
    window.open(`/play${isNds ? '-nds' : ''}/${saveFileId}`, '_blank');
  };

  const handleNewGame = () => {
    if (!selectedGame) return;
    setSelectedGame(null);
    // 不预建 DB 记录，直接打开模拟器。首次同步时服务器自动创建存档。
    window.open(`/play${isNds ? '-nds' : ''}/new/${selectedGame.gameId}`, '_blank');
  };

  return (
    <div style={{ padding: 32, maxWidth: 1200, margin: '0 auto' }}>
      <Title level={2}>工作台</Title>
      <Row gutter={[24, 24]} style={{ marginTop: 24 }}>
        {/* 功能入口 */}
        <Col xs={24} sm={12} md={8} lg={6}>
          <Card hoverable onClick={() => navigate('/saves')}
            style={{ textAlign: 'center', minHeight: 200 }}>
            <SaveOutlined style={{ fontSize: 48, color: '#1890ff', marginBottom: 16 }} />
            <Title level={4}>存档管理</Title>
            <p>上传和管理你的游戏存档</p>
            <Button type="primary">进入</Button>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8} lg={6}>
          <Card hoverable onClick={() => navigate('/bank')}
            style={{ textAlign: 'center', minHeight: 200 }}>
            <BankOutlined style={{ fontSize: 48, color: '#52c41a', marginBottom: 16 }} />
            <Title level={4}>我的银行</Title>
            <p>在线宝可梦收藏管理</p>
            <Button type="primary">进入</Button>
          </Card>
        </Col>

        {/* GBA 游戏卡片 (Gen3) — 按发行日期排序 */}
        {GAMES.map(game => (
          <Col key={game.gameId} xs={24} sm={12} md={8} lg={6}>
            <Card hoverable onClick={() => setSelectedGame(game)}
              style={{ textAlign: 'center', minHeight: 300, borderColor: game.color }}>
              <GameCover gameId={game.gameId} color={game.color} />
              <Title level={4}>游玩{game.displayName.replace('宝可梦 ', '')}</Title>
              <p>在线{game.displayName}</p>
              <Button type="primary" style={{ background: game.color, borderColor: game.color }}>
                开始游戏
              </Button>
            </Card>
          </Col>
        ))}

        {/* NDS 游戏卡片 (Gen4/5) — 按发行日期排序 */}
        {NDS_GAMES.map(game => (
          <Col key={game.gameId} xs={24} sm={12} md={8} lg={6}>
            <Card hoverable onClick={() => setSelectedGame(game)}
              style={{ textAlign: 'center', minHeight: 300, borderColor: game.color }}>
              <GameCover gameId={game.gameId} color={game.color} />
              <Title level={4}>游玩{game.displayName.replace('宝可梦 ', '')}</Title>
              <p>在线{game.displayName}</p>
              <Button type="primary" style={{ background: game.color, borderColor: game.color }}>
                开始游戏
              </Button>
            </Card>
          </Col>
        ))}
      </Row>

      {/* 游戏选择 Modal — 复用同一对话框，标题和 newGame 动态切换 */}
      <Modal
        title={selectedGame ? `游玩${selectedGame.displayName.replace('宝可梦 ', '')}` : ''}
        open={selectedGame !== null}
        onCancel={() => setSelectedGame(null)}
        footer={null}
        width={520}
      >
        {loadingSaves ? (
          <div style={{ textAlign: 'center', padding: 32 }}><Spin /></div>
        ) : matchingSaves.length > 0 ? (
          <>
            <Text type="secondary" style={{ marginBottom: 12, display: 'block' }}>
              选择已有存档继续游戏
            </Text>
            <List
              dataSource={matchingSaves}
              renderItem={(save) => (
                <List.Item
                  onClick={() => handleSelectSave(save.saveFileId)}
                  style={{ cursor: 'pointer', padding: '10px 12px', borderRadius: 6 }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#f6ffed'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ''; }}
                >
                  <List.Item.Meta
                    title={save.filename}
                    description={
                      <span>
                        {save.trainerName && <><Text>{save.trainerName}</Text> &middot; </>}
                        <Tag color={save.generation >= 4 ? 'blue' : 'green'}>
                          Gen{save.generation} {save.generation >= 4 ? 'NDS' : 'GBA'}
                        </Tag>
                        {save.pokemonCount > 0 && <Text type="secondary"> {save.pokemonCount} 只宝可梦</Text>}
                      </span>
                    }
                  />
                </List.Item>
              )}
              style={{ marginBottom: 16 }}
            />
            <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 16 }}>
              <Text type="secondary" style={{ marginBottom: 8, display: 'block' }}>
                或者开始全新游戏
              </Text>
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <Text type="secondary">暂无{selectedGame?.displayName}存档</Text>
          </div>
        )}

        <Button
          type="dashed"
          block
          size="large"
          icon={<PlusOutlined />}
          onClick={handleNewGame}
          style={{ marginTop: matchingSaves.length > 0 ? 0 : 8, height: 48 }}
        >
          新游戏
        </Button>
      </Modal>
    </div>
  );
};

export default DashboardPage;
