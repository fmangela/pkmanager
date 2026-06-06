import React, { useEffect, useState } from 'react';
import { Card, Form, Input, Button, App, Typography, Space, Divider } from 'antd';
import { SaveOutlined, DesktopOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useSettingsStore } from '../stores/settingsStore';
import { useNavigate } from 'react-router-dom';

const { Title, Text } = Typography;

// ── Form field keys ────────────────────────────────────────────────

const DESMUME_EXE = 'desmume.exe_path';
const DESMUME_SAVE = 'desmume.save_dir';
const AZAHAR_EXE = 'azahar.exe_path';
const AZAHAR_DATA = 'azahar.data_dir';

const SettingsPage: React.FC = () => {
  const { fetch, save } = useSettingsStore();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch().then((settings) => {
      form.setFieldsValue({
        [DESMUME_EXE]: settings[DESMUME_EXE] || '',
        [DESMUME_SAVE]: settings[DESMUME_SAVE] || '',
        [AZAHAR_EXE]: settings[AZAHAR_EXE] || '',
        [AZAHAR_DATA]: settings[AZAHAR_DATA] || '',
      });
    });
  }, []);

  const handleSave = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await save({
        [DESMUME_EXE]: values[DESMUME_EXE] || '',
        [DESMUME_SAVE]: values[DESMUME_SAVE] || '',
        [AZAHAR_EXE]: values[AZAHAR_EXE] || '',
        [AZAHAR_DATA]: values[AZAHAR_DATA] || '',
      });
      message.success('设置已保存');
    } catch {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: 32, maxWidth: 800, margin: '0 auto' }}>
      <Title level={2}>设置</Title>

      <Form form={form} layout="vertical">
        {/* ── DeSmuME (NDS) ── */}
        <Card
          size="small"
          title={
            <Space>
              <DesktopOutlined />
              <span>DeSmuME — NDS 模拟器</span>
            </Space>
          }
          style={{ marginBottom: 16 }}
        >
          <Form.Item
            name={DESMUME_EXE}
            label="可执行文件路径"
            extra="例如 /usr/bin/desmume 或 flatpak 路径"
          >
            <Input placeholder="/usr/bin/desmume" />
          </Form.Item>
          <Form.Item
            name={DESMUME_SAVE}
            label="存档目录"
            extra=".dsv 文件所在目录（通常为 ~/.config/desmume/）"
          >
            <Input placeholder="~/.config/desmume" />
          </Form.Item>
        </Card>

        {/* ── Azahar (3DS) ── */}
        <Card
          size="small"
          title={
            <Space>
              <ThunderboltOutlined />
              <span>Azahar — 3DS 模拟器</span>
            </Space>
          }
          style={{ marginBottom: 24 }}
        >
          <Form.Item
            name={AZAHAR_EXE}
            label="可执行文件路径"
            extra="例如 /usr/bin/azahar 或 AppImage 路径"
          >
            <Input placeholder="/usr/bin/azahar" />
          </Form.Item>
          <Form.Item
            name={AZAHAR_DATA}
            label="用户数据目录"
            extra="包含 sdmc/ 的目录（通常为 ~/.local/share/azahar-emu/）"
          >
            <Input placeholder="~/.local/share/azahar-emu" />
          </Form.Item>
        </Card>

        <Space>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSave}
            loading={saving}
          >
            保存设置
          </Button>
          <Button onClick={() => navigate('/dashboard')}>返回工作台</Button>
        </Space>
      </Form>

      <Divider />
      <Text type="secondary" style={{ fontSize: 12 }}>
        这些设置按设备独立存储。换电脑后需要重新配置。
      </Text>
    </div>
  );
};

export default SettingsPage;
