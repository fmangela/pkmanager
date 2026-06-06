import React, { useEffect, useState, useCallback } from 'react';
import {
  Typography, Table, Button, Upload, Popconfirm, App, Tag, Space, Card,
} from 'antd';
import { UploadOutlined, DeleteOutlined, EyeOutlined, FileAddOutlined, ArrowLeftOutlined, PlayCircleOutlined, DesktopOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate } from 'react-router-dom';
import { saveFileApi, emulatorApi, type SaveFileInfo } from '../api/saveFile';
import { GAME_VERSION_DISPLAY, GENERATION_MAP } from '../constants/games';
import GameCover from '../components/GameCover';

const { Title } = Typography;

const SavesPage: React.FC = () => {
  const [saves, setSaves] = useState<SaveFileInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [launchStates, setLaunchStates] = useState<Record<string, { pid: number; type: string; status: string }>>({});
  const navigate = useNavigate();
  const { message } = App.useApp();

  // ── 轮询本地模拟器状态 ────────────────────────────────
  useEffect(() => {
    const activeIds = Object.keys(launchStates).filter(id => launchStates[id]?.status === 'running');
    if (activeIds.length === 0) return;

    const timer = setInterval(async () => {
      for (const saveFileId of activeIds) {
        try {
          const res = await emulatorApi.localStatus(saveFileId);
          if (!res.data.running) {
            // 模拟器已关闭 → 自动同步
            setLaunchStates(prev => ({ ...prev, [saveFileId]: { ...prev[saveFileId], status: 'syncing' } }));
            try {
              await emulatorApi.syncFromLocal(saveFileId);
              message.success('存档已自动同步');
            } catch (e: any) {
              message.warning('模拟器已关闭，但自动同步失败。请手动点击「本机」按钮重试');
            }
            setLaunchStates(prev => {
              const next = { ...prev };
              delete next[saveFileId];
              return next;
            });
          }
        } catch {
          // 网络错误，忽略本次轮询
        }
      }
    }, 2000);

    return () => clearInterval(timer);
  }, [launchStates, message]);

  // ── 启动本地模拟器 ────────────────────────────────────
  const handleLaunchLocal = async (record: SaveFileInfo) => {
    if (launchStates[record.saveFileId]) {
      message.warning('该存档的模拟器已在运行中');
      return;
    }
    const saveFileId = record.saveFileId;
    setLaunchStates(prev => ({ ...prev, [saveFileId]: { pid: 0, type: '', status: 'launching' } }));
    try {
      const res = await emulatorApi.launchLocal(saveFileId);
      message.success(`模拟器已启动 (PID: ${res.data.pid})`);
      setLaunchStates(prev => ({ ...prev, [saveFileId]: { pid: res.data.pid, type: res.data.type, status: 'running' } }));
    } catch (err: any) {
      message.error(err.response?.data?.message || '启动失败');
      setLaunchStates(prev => {
        const next = { ...prev };
        delete next[saveFileId];
        return next;
      });
    }
  };

  const fetchSaves = useCallback(async () => {
    setLoading(true);
    try {
      const res = await saveFileApi.list();
      setSaves(res.data);
    } catch {
      message.error('加载存档列表失败');
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    fetchSaves();
  }, [fetchSaves]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      await saveFileApi.upload(file);
      message.success('存档上传并解析成功！');
      fetchSaves();
    } catch (err: any) {
      message.error(err.response?.data?.message || '上传失败，请检查文件格式');
    } finally {
      setUploading(false);
    }
    return false; // Prevent default upload behavior
  };

  const handleDelete = async (id: string) => {
    try {
      await saveFileApi.delete(id);
      message.success('存档已删除');
      fetchSaves();
    } catch {
      message.error('删除失败');
    }
  };

  const formatPlayTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  };

  const columns: ColumnsType<SaveFileInfo> = [
    {
      title: '文件名',
      dataIndex: 'filename',
      key: 'filename',
      ellipsis: true,
    },
    {
      title: '游戏',
      dataIndex: 'gameVersion',
      key: 'gameVersion',
      width: 110,
      render: (ver: number) => {
        const info = GAME_VERSION_DISPLAY[ver];
        return (
          <Space size={8}>
            <GameCover gameVersion={ver} size="small" showPlatform={false}
              style={{ minWidth: 0, minHeight: 0, padding: 0 }} />
            {info
              ? <Tag color={info.color}>{info.name}</Tag>
              : <Tag>{GENERATION_MAP[ver] || `Gen${ver}`}</Tag>
            }
          </Space>
        );
      },
    },
    {
      title: '训练家',
      dataIndex: 'trainerName',
      key: 'trainerName',
      width: 90,
    },
    {
      title: '宝可梦',
      dataIndex: 'pokemonCount',
      key: 'pokemonCount',
      width: 70,
      align: 'center',
    },
    {
      title: '时间',
      dataIndex: 'playTime',
      key: 'playTime',
      width: 80,
      render: (t: number) => formatPlayTime(t),
    },
    {
      title: '状态',
      dataIndex: 'isModified',
      key: 'isModified',
      width: 80,
      render: (modified: boolean) =>
        modified ? <Tag color="orange">已修改</Tag> : <Tag>原始</Tag>,
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 160,
      render: (date: string) => new Date(date).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 180,
      render: (_, record) => (
        <Space>
          {(record.generation === 3 || record.generation === 4 || record.generation === 5) && (
            <Button type="link" size="small" icon={<PlayCircleOutlined />}
              onClick={() => window.open(`/play${record.generation >= 4 ? '-nds' : ''}/${record.saveFileId}`, '_blank')}
              style={{ color: '#52c41a' }}>WASM</Button>
          )}
          {(record.generation >= 4) && (
            (() => {
              const ls = launchStates[record.saveFileId];
              if (ls?.status === 'launching') return <Button type="link" size="small" loading>启动中</Button>;
              if (ls?.status === 'running') return (
                <Button type="link" size="small" icon={<DesktopOutlined />} style={{ color: '#52c41a' }}>
                  {ls.type === 'azahar' ? '3DS' : 'NDS'} 运行中
                </Button>
              );
              if (ls?.status === 'syncing') return <Button type="link" size="small" loading>同步中</Button>;
              return (
                <Button type="link" size="small" icon={<DesktopOutlined />}
                  onClick={() => handleLaunchLocal(record)}>本机</Button>
              );
            })()
          )}
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => navigate(`/saves/${record.saveFileId}`)}
          >
            查看
          </Button>
          <Popconfirm
            title="确定删除此存档？"
            description="删除后数据不可恢复"
            onConfirm={() => handleDelete(record.saveFileId)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 32, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/dashboard')}>返回</Button>
          <Title level={2} style={{ margin: 0 }}>存档管理</Title>
        </Space>
        <Upload
          accept=".sav,.dat,.dsv,.gci"
          showUploadList={false}
          beforeUpload={handleUpload}
        >
          <Button type="primary" icon={<UploadOutlined />} loading={uploading} size="large">
            上传存档
          </Button>
        </Upload>
      </div>

      <Card>
        <Table
          columns={columns}
          dataSource={saves}
          rowKey="saveFileId"
          loading={loading}
          scroll={{ x: 860 }}
          pagination={{ pageSize: 10 }}
          locale={{
            emptyText: (
              <div style={{ padding: 48 }}>
                <FileAddOutlined style={{ fontSize: 48, color: '#ccc' }} />
                <p style={{ marginTop: 16, color: '#999' }}>
                  暂无存档，点击「上传存档」开始
                </p>
              </div>
            ),
          }}
        />
      </Card>
    </div>
  );
};

export default SavesPage;
