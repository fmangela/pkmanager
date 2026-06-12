import React, { useState, useCallback } from 'react';
import { Card, InputNumber, Button, App, Spin, Alert, Typography, Row, Col, Space } from 'antd';
import { SaveOutlined, ClockCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { saveFileApi, type GenToolsDto, type Rtc3EntryDto } from '../../api/saveFile';

const { Text, Title } = Typography;

interface Props {
  saveFileId: string;
}

const GenToolsPanel: React.FC<Props> = ({ saveFileId }) => {
  const [genTools, setGenTools] = useState<GenToolsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const { message } = App.useApp();

  const fetchGenTools = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await saveFileApi.getGenTools(saveFileId);
      setGenTools(res.data);
    } catch {
      setError(true);
      message.error('获取世代工具数据失败');
    } finally {
      setLoading(false);
    }
  }, [saveFileId, message]);

  if (loading && genTools == null && !error) {
    void fetchGenTools();
  }

  const handleRtcChange = (key: string, field: keyof Rtc3EntryDto, value: number | null) => {
    if (!genTools?.rtcEntries) return;
    setGenTools({
      ...genTools,
      rtcEntries: genTools.rtcEntries.map(e =>
        e.key === key ? { ...e, [field]: value ?? 0 } : e,
      ),
    });
  };

  const handleSave = async () => {
    if (!genTools) return;
    setSaving(true);
    try {
      await saveFileApi.saveGenTools(saveFileId, genTools);
      message.success('RTC 时钟已保存');
    } catch {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>;
  }

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <Alert
          type="error"
          message="加载失败"
          description="获取世代工具数据时发生错误，请检查网络连接后重试。"
          showIcon
          action={
            <Button size="small" icon={<ReloadOutlined />} onClick={fetchGenTools}>
              重试
            </Button>
          }
        />
      </div>
    );
  }

  if (!genTools?.capability.hasRtc) {
    return (
      <div style={{ padding: 24 }}>
        <Alert
          type="info"
          message="当前存档不支持 RTC 时钟功能"
          description="RTC（Real-Time Clock）仅在丰缘地区游戏（红宝石/蓝宝石/绿宝石）中可用。火红/叶绿没有实时时钟功能。"
          showIcon
        />
      </div>
    );
  }

  const rtcEntries = genTools.rtcEntries;

  const fieldDefs: Array<{ field: keyof Rtc3EntryDto; label: string; min: number; max: number }> = [
    { field: 'day', label: '日', min: 0, max: 65535 },
    { field: 'hour', label: '时', min: 0, max: 23 },
    { field: 'minute', label: '分', min: 0, max: 59 },
    { field: 'second', label: '秒', min: 0, max: 59 },
  ];

  return (
    <div>
      {/* RTC 时钟编辑器 */}
      <div style={{ marginBottom: 16 }}>
        <Title level={5} style={{ marginBottom: 12 }}>
          <ClockCircleOutlined style={{ marginRight: 6 }} />
          RTC 实时时钟
        </Title>
        <Row gutter={[16, 16]}>
          {rtcEntries?.map(entry => (
            <Col xs={24} md={12} key={entry.key}>
              <Card
                size="small"
                title={<Text strong>{entry.label}</Text>}
                style={{ height: '100%' }}
              >
                <Space direction="vertical" style={{ width: '100%' }}>
                  {fieldDefs.map(fd => (
                    <div key={fd.field} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <Text type="secondary" style={{ width: 28, textAlign: 'right', flexShrink: 0 }}>
                        {fd.label}
                      </Text>
                      <InputNumber
                        value={entry[fd.field] as number}
                        onChange={v => handleRtcChange(entry.key, fd.field, v)}
                        min={fd.min}
                        max={fd.max}
                        style={{ flex: 1 }}
                        size="small"
                      />
                    </div>
                  ))}
                </Space>
              </Card>
            </Col>
          ))}
        </Row>
        <Text type="secondary" style={{ display: 'block', marginTop: 12, fontSize: 12 }}>
          修改时钟可修复电池耗尽导致的树果不生长、潮汐洞穴不变化等问题。修改后建议在游戏中等待一天以触发时钟同步。
        </Text>
      </div>

      {/* 保存按钮 */}
      <div style={{
        position: 'sticky', bottom: 0, background: 'var(--bg-surface, #fff)',
        padding: '12px 0', borderTop: '1px solid var(--border-color, #f0f0f0)',
        textAlign: 'right', marginTop: 24,
      }}>
        <Button
          type="primary"
          icon={<SaveOutlined />}
          onClick={handleSave}
          loading={saving}
        >
          保存时钟设置
        </Button>
      </div>
    </div>
  );
};

export default GenToolsPanel;
