import React, { useEffect, useState, useCallback } from 'react';
import {
  Typography, Table, Button, Upload, Popconfirm, App, Tag, Space, Card,
} from 'antd';
import { UploadOutlined, DeleteOutlined, EyeOutlined, FileAddOutlined, PlayCircleOutlined, DesktopOutlined, SettingOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { saveFileApi, type SaveFileInfo } from '../api/saveFile';
import { GAME_VERSION_COLORS, GENERATION_MAP, getVersionDisplayName } from '../constants/games';
import GameCover from '../components/GameCover';
import PageContainer from '../components/PageContainer';
import { launchLocalSave } from '../lib/localLaunch';
import type { ApiError } from '../api/axios';
import { formatLocaleDateTime } from '../i18n/locale';

const { Text } = Typography;

const SavesPage: React.FC = () => {
  const { t, i18n } = useTranslation(['common', 'messages', 'pages']);
  const [saves, setSaves] = useState<SaveFileInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [launchStates, setLaunchStates] = useState<Record<string, { pid: number; type: string; status: string }>>({});
  const navigate = useNavigate();
  const { message } = App.useApp();

  // ── 本地模拟器启动为浏览器端脚本下载方式，无需轮询 PID ──

  // ── 启动本地模拟器（浏览器端调起）────────────────────
  const handleLaunchLocal = async (record: SaveFileInfo) => {
    if (launchStates[record.saveFileId]) {
      message.warning(t('emulatorAlreadyRunning', { ns: 'messages', defaultValue: '该存档的模拟器已在运行中' }));
      return;
    }
    const saveFileId = record.saveFileId;
    setLaunchStates(prev => ({ ...prev, [saveFileId]: { pid: 0, type: '', status: 'launching' } }));

    try {
      await launchLocalSave(saveFileId, message, record.filename);
    } catch (err: unknown) {
      const apiError = err as ApiError & { message?: string };
      message.error(apiError.message || apiError.response?.data?.message || t('launchFailed', { ns: 'messages', defaultValue: '启动失败' }));
    } finally {
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
      message.error(t('loadSaveListFailed', { ns: 'messages', defaultValue: '加载存档列表失败' }));
    } finally {
      setLoading(false);
    }
  }, [message, t]);

  useEffect(() => {
    fetchSaves();
  }, [fetchSaves]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      await saveFileApi.upload(file);
      message.success(t('uploadSaveSuccess', { ns: 'messages', defaultValue: '存档上传并解析成功！' }));
      fetchSaves();
    } catch (err: unknown) {
      const apiError = err as ApiError;
      message.error(apiError.response?.data?.message || t('uploadFailedCheckFormat', { ns: 'messages', defaultValue: '上传失败，请检查文件格式' }));
    } finally {
      setUploading(false);
    }
    return false; // Prevent default upload behavior
  };

  const handleDelete = async (id: string) => {
    try {
      await saveFileApi.delete(id);
      message.success(t('saveDeleted', { ns: 'messages', defaultValue: '存档已删除' }));
      fetchSaves();
    } catch {
      message.error(t('deleteFailed', { ns: 'messages', defaultValue: '删除失败' }));
    }
  };

  const formatPlayTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  };

  const columns: ColumnsType<SaveFileInfo> = [
    {
      title: t('saves.column.filename', { ns: 'pages', defaultValue: '文件名' }),
      dataIndex: 'filename',
      key: 'filename',
      ellipsis: true,
    },
    {
      title: t('saves.column.game', { ns: 'pages', defaultValue: '游戏' }),
      dataIndex: 'gameVersion',
      key: 'gameVersion',
      width: 110,
      render: (ver: number) => {
        const color = GAME_VERSION_COLORS[ver];
        return (
          <Space size={8}>
            <GameCover gameVersion={ver} size="small" showPlatform={false}
              style={{ minWidth: 0, minHeight: 0, padding: 0 }} />
            {color
              ? <Tag color={color}>{getVersionDisplayName(ver)}</Tag>
              : <Tag>{GENERATION_MAP[ver] || `Gen${ver}`}</Tag>
            }
          </Space>
        );
      },
    },
    {
      title: t('saves.column.trainer', { ns: 'pages', defaultValue: '训练家' }),
      dataIndex: 'trainerName',
      key: 'trainerName',
      width: 90,
    },
    {
      title: t('saves.column.pokemon', { ns: 'pages', defaultValue: '宝可梦' }),
      dataIndex: 'pokemonCount',
      key: 'pokemonCount',
      width: 70,
      align: 'center',
    },
    {
      title: t('saves.column.time', { ns: 'pages', defaultValue: '时间' }),
      dataIndex: 'playTime',
      key: 'playTime',
      width: 80,
      render: (t: number) => formatPlayTime(t),
    },
    {
      title: t('saves.column.status', { ns: 'pages', defaultValue: '状态' }),
      dataIndex: 'isModified',
      key: 'isModified',
      width: 80,
      render: (modified: boolean) =>
        modified
          ? <Tag color="orange">{t('saves.status.modified', { ns: 'pages', defaultValue: '已修改' })}</Tag>
          : <Tag>{t('saves.status.original', { ns: 'pages', defaultValue: '原始' })}</Tag>,
    },
    {
      title: t('saves.column.updatedAt', { ns: 'pages', defaultValue: '更新时间' }),
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 160,
      render: (date: string) => formatLocaleDateTime(date, i18n.language),
    },
    {
      title: t('saves.column.actions', { ns: 'pages', defaultValue: '操作' }),
      key: 'actions',
      width: 180,
      render: (_, record) => (
        <Space>
          {(record.generation === 3 || record.generation === 4 || record.generation === 5) && (
            <Button type="link" size="small" icon={<PlayCircleOutlined />}
              onClick={() => window.open(`/play${record.generation >= 4 ? '-nds' : ''}/${record.saveFileId}`, '_blank')}
              style={{ color: '#52c41a' }}>{t('saves.action.wasm', { ns: 'pages', defaultValue: 'WASM' })}</Button>
          )}
          {(record.generation >= 4) && (
            (() => {
              const ls = launchStates[record.saveFileId];
              if (ls?.status === 'launching') return <Button type="link" size="small" loading>{t('saves.action.launching', { ns: 'pages', defaultValue: '启动中' })}</Button>;
              if (ls?.status === 'running') return (
                <Button type="link" size="small" icon={<DesktopOutlined />} style={{ color: '#52c41a' }}>
                  {t('saves.action.running', {
                    ns: 'pages',
                    defaultValue: '{{platform}} 运行中',
                    platform: ls.type === 'azahar' ? '3DS' : 'NDS',
                  })}
                </Button>
              );
              if (ls?.status === 'syncing') return <Button type="link" size="small" loading>{t('saves.action.syncing', { ns: 'pages', defaultValue: '同步中' })}</Button>;
              return (
                <Button type="link" size="small" icon={<DesktopOutlined />}
                  onClick={() => handleLaunchLocal(record)}>{t('saves.action.local', { ns: 'pages', defaultValue: '本机' })}</Button>
              );
            })()
          )}
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => navigate(`/saves/${record.saveFileId}`)}
          >
            {t('view', { ns: 'common', defaultValue: '查看' })}
          </Button>
          <Popconfirm
            title={t('saves.deleteConfirmTitle', { ns: 'pages', defaultValue: '确定删除此存档？' })}
            description={t('saves.deleteConfirmDescription', { ns: 'pages', defaultValue: '删除后数据不可恢复' })}
            onConfirm={() => handleDelete(record.saveFileId)}
            okText={t('delete', { ns: 'common', defaultValue: '删除' })}
            cancelText={t('cancel', { ns: 'common', defaultValue: '取消' })}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              {t('delete', { ns: 'common', defaultValue: '删除' })}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <PageContainer
      title={t('saves.title', { ns: 'pages', defaultValue: '存档管理' })}
      backTo="/dashboard"
      maxWidth={1200}
      extra={
        <Space size={12} align="center">
          <Button icon={<SettingOutlined />} onClick={() => navigate('/settings')}>{t('saves.emulatorSettings', { ns: 'pages', defaultValue: '模拟器设置' })}</Button>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
            <Upload showUploadList={false} beforeUpload={handleUpload}>
              <Button type="primary" icon={<UploadOutlined />} loading={uploading} size="large">
                {t('saves.uploadButton', { ns: 'pages', defaultValue: '上传存档' })}
              </Button>
            </Upload>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {t('saves.uploadHint', { ns: 'pages', defaultValue: '支持 `.sav/.dat/.dsv/.gci`，以及 3DS 无扩展名 `main`' })}
            </Text>
          </div>
        </Space>
      }
    >

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
                  {t('saves.emptyState', { ns: 'pages', defaultValue: '暂无存档，点击「上传存档」开始' })}
                </p>
              </div>
            ),
          }}
        />
      </Card>
    </PageContainer>
  );
};

export default SavesPage;
