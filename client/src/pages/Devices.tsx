import React, { useEffect, useState, useCallback } from 'react';
import { Table, Button, App, Space, Tag, Input, Typography } from 'antd';
import { EditOutlined, LogoutOutlined, ReloadOutlined, DesktopOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n/i18n';
import PageContainer from '../components/PageContainer';
import { authApi, type DeviceDto } from '../api/auth';
import { useAuthStore } from '../stores/authStore';
import { formatLocaleDateTime } from '../i18n/locale';

const { Text } = Typography;

// ── Helper: derive a short label from UA string ─────────────────────
function summarizeUa(ua: string | null): string {
  if (!ua) return '';
  // Browser
  let browser = 'Unknown';
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/Chrome\//.test(ua) && !/Chromium\//.test(ua)) browser = 'Chrome';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) browser = 'Safari';

  // OS
  let os = 'Unknown';
  if (/Windows NT 10/.test(ua)) os = 'Windows 10/11';
  else if (/Windows NT/.test(ua)) os = 'Windows';
  else if (/Mac OS X/.test(ua)) os = 'macOS';
  else if (/Linux/.test(ua) && !/Android/.test(ua)) os = 'Linux';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS';

  return `${browser} · ${os}`;
}

const DevicesPage: React.FC = () => {
  const { t } = useTranslation(['pages', 'messages']);
  const { message, modal } = App.useApp();
  const [devices, setDevices] = useState<DeviceDto[]>([]);
  const [loading, setLoading] = useState(false);
  const logout = useAuthStore((s) => s.logout);

  // Current device id from localStorage (for marking "current" row client-side too)
  const currentDeviceId = localStorage.getItem('pkmanager_device_id') || '';

  const loadDevices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authApi.listDevices();
      setDevices(res.data);
    } catch {
      message.error(t('pages.devices.loadFailed', { defaultValue: '加载设备列表失败' }));
    } finally {
      setLoading(false);
    }
  }, [message, t]);

  useEffect(() => {
    void loadDevices();
  }, [loadDevices]);

  const handleRename = (device: DeviceDto) => {
    let next = device.deviceLabel ?? '';
    modal.confirm({
      title: t('pages.devices.renameTitle', { defaultValue: '重命名设备' }),
      content: (
        <Input
          defaultValue={next}
          maxLength={50}
          onChange={(e) => { next = e.target.value; }}
          placeholder={t('pages.devices.renamePlaceholder', { defaultValue: '如：我的电脑' })}
        />
      ),
      onOk: async () => {
        if (!next.trim()) {
          message.warning(t('pages.devices.labelEmpty', { defaultValue: '设备名不能为空' }));
          throw new Error('empty');
        }
        try {
          await authApi.renameDevice(device.deviceId, next.trim());
          message.success(t('messages.auth.deviceRenamed', { defaultValue: '设备名已更新' }));
          await loadDevices();
        } catch {
          message.error(t('pages.devices.renameFailed', { defaultValue: '重命名失败' }));
          throw new Error('failed');
        }
      },
    });
  };

  const handleRevoke = (device: DeviceDto) => {
    if (device.isCurrent || device.deviceId === currentDeviceId) {
      // Revoke current device = logout
      modal.confirm({
        title: t('pages.devices.logoutCurrentTitle', { defaultValue: '退出当前设备' }),
        content: t('pages.devices.logoutCurrentConfirm', { defaultValue: '将退出当前设备并跳转登录页，确定吗？' }),
        okText: t('pages.devices.logout', { defaultValue: '退出登录' }),
        okButtonProps: { danger: true },
        onOk: async () => {
          await logout();
          window.location.href = '/login';
        },
      });
      return;
    }
    modal.confirm({
      title: t('pages.devices.kickOutTitle', { defaultValue: '踢出设备' }),
      content: t('pages.devices.kickOutConfirm', { defaultValue: '该设备下次请求将被强制登出，确定吗？' }),
      okText: t('pages.devices.kickOut', { defaultValue: '踢出' }),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await authApi.revokeDevice(device.deviceId);
          message.success(t('messages.auth.deviceRevoked', { defaultValue: '设备已踢出' }));
          await loadDevices();
        } catch {
          message.error(t('pages.devices.kickOutFailed', { defaultValue: '踢出失败' }));
        }
      },
    });
  };

  const columns = [
    {
      title: t('pages.devices.deviceName', { defaultValue: '设备' }),
      key: 'name',
      render: (_: unknown, d: DeviceDto) => (
        <Space direction="vertical" size={0}>
          <Space>
            <DesktopOutlined />
            <Text strong>{d.deviceLabel || summarizeUa(d.userAgent) || d.deviceId.slice(0, 8)}</Text>
            {(d.isCurrent || d.deviceId === currentDeviceId) && (
              <Tag color="green">{t('pages.devices.currentDevice', { defaultValue: '当前设备' })}</Tag>
            )}
          </Space>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {summarizeUa(d.userAgent) || d.deviceId}
          </Text>
        </Space>
      ),
    },
    {
      title: t('pages.devices.lastUsed', { defaultValue: '最后使用' }),
      dataIndex: 'lastUsedAt',
      key: 'lastUsed',
      render: (v: string | null) => v ? formatLocaleDateTime(v, i18n.language) : '—',
    },
    {
      title: t('pages.devices.expiresAt', { defaultValue: '过期时间' }),
      dataIndex: 'expiresAt',
      key: 'expiresAt',
      render: (v: string) => formatLocaleDateTime(v, i18n.language),
    },
    {
      title: t('pages.devices.actions', { defaultValue: '操作' }),
      key: 'actions',
      width: 200,
      render: (_: unknown, d: DeviceDto) => (
        <Space>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleRename(d)}
          >
            {t('pages.devices.rename', { defaultValue: '重命名' })}
          </Button>
          <Button
            size="small"
            danger
            icon={<LogoutOutlined />}
            onClick={() => handleRevoke(d)}
          >
            {(d.isCurrent || d.deviceId === currentDeviceId)
              ? t('pages.devices.logout', { defaultValue: '退出登录' })
              : t('pages.devices.kickOut', { defaultValue: '踢出' })}
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <PageContainer
      title={t('pages.devices.title', { defaultValue: '我的设备' })}
      backTo="/dashboard"
      maxWidth={900}
      extra={
        <Button icon={<ReloadOutlined />} onClick={loadDevices} loading={loading}>
          {t('pages.devices.refresh', { defaultValue: '刷新' })}
        </Button>
      }
    >
      <Table
        rowKey="deviceId"
        columns={columns}
        dataSource={devices}
        loading={loading}
        pagination={false}
      />
      <div style={{ marginTop: 16 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {t('pages.devices.hint', { defaultValue: '同一账号可同时登录多台设备，互不影响。每台设备的登录状态最长保留 7 天，过期或被踢出后需要重新登录。' })}
        </Text>
      </div>
    </PageContainer>
  );
};

export default DevicesPage;
