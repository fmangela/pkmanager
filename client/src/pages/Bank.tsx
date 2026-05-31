import React, { useEffect, useState, useCallback } from 'react';
import {
  Typography, Card, Input, Select, Switch, Row, Col, Pagination,
  Tag, Empty, App, Button, Popconfirm, Space, Drawer, Descriptions, Image,
} from 'antd';
import {
  SearchOutlined, DeleteOutlined, StarFilled, AppstoreOutlined,
  UnorderedListOutlined, ArrowLeftOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { bankApi, type BankPokemon } from '../api/bank';

const { Title, Text } = Typography;

const GENERATION_OPTIONS = [
  { value: 3, label: 'Gen3 (GBA)' },
  { value: 4, label: 'Gen4 (NDS)' },
  { value: 5, label: 'Gen5 (NDS)' },
  { value: 6, label: 'Gen6 (3DS)' },
  { value: 7, label: 'Gen7 (3DS)' },
];

const BankPage: React.FC = () => {
  const navigate = useNavigate();
  const [pokemon, setPokemon] = useState<BankPokemon[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);

  // Filters
  const [generation, setGeneration] = useState<number | undefined>();
  const [isShiny, setIsShiny] = useState<boolean | undefined>();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);

  // Detail drawer
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedPokemon, setSelectedPokemon] = useState<BankPokemon | null>(null);

  const { message } = App.useApp();

  const fetchBank = useCallback(async () => {
    setLoading(true);
    try {
      const res = await bankApi.list({ generation, isShiny, search: search || undefined, page, pageSize });
      setPokemon(res.data.items);
      setTotal(res.data.total);
    } catch {
      message.error('加载银行数据失败');
    } finally {
      setLoading(false);
    }
  }, [generation, isShiny, search, page, pageSize, message]);

  useEffect(() => {
    fetchBank();
  }, [fetchBank]);

  const handleDelete = async (id: string) => {
    try {
      await bankApi.delete(id);
      message.success('已从银行移除');
      fetchBank();
    } catch {
      message.error('删除失败');
    }
  };

  const handleBatchDelete = async () => {
    try {
      await bankApi.batchDelete(selectedRowKeys);
      message.success(`已删除 ${selectedRowKeys.length} 只宝可梦`);
      setSelectedRowKeys([]);
      fetchBank();
    } catch {
      message.error('批量删除失败');
    }
  };

  const showDetail = (p: BankPokemon) => {
    setSelectedPokemon(p);
    setDetailOpen(true);
  };

  // ── Rendering ────────────────────────────────────────

  const renderPokemonCard = (p: BankPokemon) => (
    <Card
      key={p.id}
      hoverable
      size="small"
      style={{
        width: 160,
        textAlign: 'center',
        border: p.isShiny ? '2px solid #faad14' : undefined,
      }}
      onClick={() => showDetail(p)}
      cover={
        <div style={{ padding: '12px 0 0', position: 'relative' }}>
          <Image
            src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${p.species}.png`}
            alt={p.speciesName}
            preview={false}
            style={{ width: 80, height: 80, imageRendering: 'pixelated' }}
            fallback="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAiIGhlaWdodD0iODAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjgwIiBoZWlnaHQ9IjgwIiBmaWxsPSIjZjBmMGYwIi8+PHRleHQgeD0iNDAiIHk9IjQwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSIgZmlsbD0iIzk5OSIgZm9udC1zaXplPSIxMiI+UGs8L3RleHQ+PC9zdmc+"
          />
          {p.isShiny && (
            <StarFilled style={{
              position: 'absolute', top: 4, right: 8, color: '#faad14', fontSize: 16,
            }} />
          )}
        </div>
      }
    >
      <div style={{ marginBottom: 4 }}>
        <Text strong>{p.nickname || p.speciesName}</Text>
      </div>
      {p.nickname && (
        <div style={{ fontSize: 11, color: '#999', marginBottom: 2 }}>
          {p.speciesName}
        </div>
      )}
      <Tag color="blue">Lv.{p.level}</Tag>
      {p.isShiny && <Tag color="gold">闪光</Tag>}
      <div style={{ marginTop: 4 }}>
        <Tag>{GENERATION_OPTIONS.find(g => g.value === p.generation)?.label || `Gen${p.generation}`}</Tag>
      </div>
    </Card>
  );

  const renderListView = () => {
    const items = pokemon.map(p => (
      <Card
        key={p.id}
        hoverable
        size="small"
        style={{ marginBottom: 8 }}
        onClick={() => showDetail(p)}
      >
        <Row align="middle" gutter={16}>
          <Col flex="60px">
            <Image
              src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${p.species}.png`}
              preview={false}
              style={{ width: 48, height: 48, imageRendering: 'pixelated' }}
              fallback="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjQ4IiBoZWlnaHQ9IjQ4IiBmaWxsPSIjZjBmMGYwIi8+PHRleHQgeD0iMjQiIHk9IjI0IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSIgZmlsbD0iIzk5OSIgZm9udC1zaXplPSI4Ij5QazwvdGV4dD48L3N2Zz4="
            />
          </Col>
          <Col flex="auto">
            <Text strong>{p.nickname || p.speciesName}</Text>
            {p.nickname && <Text type="secondary" style={{ marginLeft: 8 }}>({p.speciesName})</Text>}
            <div>
              <Tag color="blue">Lv.{p.level}</Tag>
              {p.natureName && <Tag>{p.natureName}</Tag>}
              {p.isShiny && <Tag color="gold">✨ 闪光</Tag>}
              <Tag>{GENERATION_OPTIONS.find(g => g.value === p.generation)?.label || `Gen${p.generation}`}</Tag>
            </div>
          </Col>
          <Col>
            <Popconfirm
              title="确定从银行移除此宝可梦？"
              onConfirm={(e) => { e?.stopPropagation(); handleDelete(p.id); }}
              onCancel={(e) => e?.stopPropagation()}
              okText="确定"
              cancelText="取消"
            >
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                onClick={(e) => e.stopPropagation()}
              />
            </Popconfirm>
          </Col>
        </Row>
      </Card>
    ));
    return <div>{items}</div>;
  };

  return (
    <div style={{ padding: 32, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/dashboard')}>返回</Button>
          <Title level={2} style={{ margin: 0 }}>🏦 我的宝可梦银行</Title>
        </Space>
        <Space>
          <Button
            icon={<AppstoreOutlined />}
            type={viewMode === 'grid' ? 'primary' : 'default'}
            onClick={() => setViewMode('grid')}
          />
          <Button
            icon={<UnorderedListOutlined />}
            type={viewMode === 'list' ? 'primary' : 'default'}
            onClick={() => setViewMode('list')}
          />
        </Space>
      </div>

      {/* Filter Bar */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={[16, 12]} align="middle">
          <Col>
            <Select
              placeholder="世代筛选"
              allowClear
              style={{ width: 140 }}
              value={generation}
              onChange={(val) => { setGeneration(val); setPage(1); }}
              options={GENERATION_OPTIONS}
            />
          </Col>
          <Col>
            <Space>
              <Text>闪光</Text>
              <Switch
                checked={isShiny}
                onChange={(val) => { setIsShiny(val || undefined); setPage(1); }}
              />
            </Space>
          </Col>
          <Col flex="auto">
            <Input
              placeholder="搜索名称或昵称..."
              prefix={<SearchOutlined />}
              allowClear
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              style={{ maxWidth: 300 }}
            />
          </Col>
          {selectedRowKeys.length > 0 && (
            <Col>
              <Popconfirm
                title={`确定删除选中的 ${selectedRowKeys.length} 只宝可梦？`}
                onConfirm={handleBatchDelete}
                okText="确定"
                cancelText="取消"
              >
                <Button danger>删除选中 ({selectedRowKeys.length})</Button>
              </Popconfirm>
            </Col>
          )}
          <Col>
            <Text type="secondary">共 {total} 只</Text>
          </Col>
        </Row>
      </Card>

      {/* Content */}
      {loading ? (
        <Card style={{ textAlign: 'center', padding: 48 }}>加载中...</Card>
      ) : pokemon.length === 0 ? (
        <Card>
          <Empty description="银行中还没有宝可梦" />
        </Card>
      ) : viewMode === 'grid' ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
          {pokemon.map(renderPokemonCard)}
        </div>
      ) : (
        <div style={{ marginBottom: 24 }}>
          {renderListView()}
        </div>
      )}

      {/* Pagination */}
      {total > pageSize && (
        <div style={{ textAlign: 'center' }}>
          <Pagination
            current={page}
            pageSize={pageSize}
            total={total}
            onChange={setPage}
            showSizeChanger={false}
            showTotal={(t) => `共 ${t} 只`}
          />
        </div>
      )}

      {/* Detail Drawer */}
      <Drawer
        title={selectedPokemon?.nickname || selectedPokemon?.speciesName || '宝可梦详情'}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        size="large"
      >
        {selectedPokemon && (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="物种">{selectedPokemon.speciesName}</Descriptions.Item>
            <Descriptions.Item label="等级">Lv.{selectedPokemon.level}</Descriptions.Item>
            {selectedPokemon.nickname && (
              <Descriptions.Item label="昵称">{selectedPokemon.nickname}</Descriptions.Item>
            )}
            <Descriptions.Item label="性格">{selectedPokemon.natureName || '-'}</Descriptions.Item>
            <Descriptions.Item label="特性">{selectedPokemon.abilityName || '-'}</Descriptions.Item>
            <Descriptions.Item label="世代">{GENERATION_OPTIONS.find(g => g.value === selectedPokemon.generation)?.label || `Gen${selectedPokemon.generation}`}</Descriptions.Item>
            <Descriptions.Item label="闪光">
              {selectedPokemon.isShiny ? <Tag color="gold">✨ 是</Tag> : '否'}
            </Descriptions.Item>
            <Descriptions.Item label="蛋">{selectedPokemon.isEgg ? '是 🥚' : '否'}</Descriptions.Item>
            <Descriptions.Item label="来源">{selectedPokemon.source === 'save_import' ? '存档导入' : '手动添加'}</Descriptions.Item>
            <Descriptions.Item label="添加时间" span={2}>
              {new Date(selectedPokemon.createdAt).toLocaleString('zh-CN')}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>
    </div>
  );
};

export default BankPage;
