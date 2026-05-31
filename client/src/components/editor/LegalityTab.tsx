import React, { useState } from 'react';
import { Alert, Tag, Button, Space, Empty, List, Image, Spin } from 'antd';
import { CheckCircleOutlined, WarningOutlined, CloseCircleOutlined, ToolOutlined, QrcodeOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import type { LegalityStatus, JudgementDto } from '../../api/saveFile';
import { saveFileApi } from '../../api/saveFile';

interface Props {
  status: LegalityStatus;
  report?: string;
  judgements: JudgementDto[];
  onFix?: (fixAction: string) => void;
  onValidate?: () => void;
  pkmDataBase64?: string;
}

const STATUS_CONFIG: Record<LegalityStatus, { color: string; icon: React.ReactNode; text: string }> = {
  Legal: { color: 'green', icon: <CheckCircleOutlined />, text: '合法' },
  Fishy: { color: 'orange', icon: <WarningOutlined />, text: '可疑' },
  Illegal: { color: 'red', icon: <CloseCircleOutlined />, text: '不合法' },
};

const LegalityTab: React.FC<Props> = ({ status, report, judgements, onFix, onValidate, pkmDataBase64 }) => {
  const [validating, setValidating] = useState(false);
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.Illegal;
  const fixableJudgements = judgements.filter(j => j.canFix);

  const handleValidate = async () => {
    setValidating(true);
    try {
      await onValidate?.();
    } finally {
      setValidating(false);
    }
  };

  // QR code state
  const [qrLoading, setQrLoading] = useState(false);
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);

  const handleGenerateQR = async () => {
    if (!pkmDataBase64) {
      setQrError('缺少宝可梦数据，无法生成QR码');
      return;
    }
    setQrLoading(true);
    setQrError(null);
    try {
      const res = await saveFileApi.generateQR(pkmDataBase64);
      const qrText = res.data;
      // Use a free QR code API to render the image
      const encoded = encodeURIComponent(qrText);
      setQrImageUrl(`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encoded}`);
    } catch {
      setQrError('QR码生成失败，请稍后重试');
    } finally {
      setQrLoading(false);
    }
  };

  return (
    <div>
      {/* Status Banner */}
      <Alert
        type={status === 'Legal' ? 'success' : status === 'Fishy' ? 'warning' : 'error'}
        message={
          <Space>
            {config.icon}
            <span style={{ fontWeight: 600 }}>{config.text}</span>
            <Tag color={config.color}>{status}</Tag>
          </Space>
        }
        description={
          status !== 'Legal' && report ? (
            <div style={{ whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto', fontSize: 12 }}>
              {report}
            </div>
          ) : status === 'Legal' ? '此宝可梦完全合法，可以安全使用。' : null
        }
        showIcon={false}
        style={{ marginBottom: 12 }}
      />

      {/* Validate Button */}
      {onValidate && (
        <div style={{ marginBottom: 12 }}>
          <Button
            icon={<SafetyCertificateOutlined />}
            onClick={handleValidate}
            loading={validating}
            type="primary"
          >
            验证合法性
          </Button>
          <span style={{ fontSize: 11, color: '#8c8c8c', marginLeft: 8 }}>
            使用 PKHeX.Core LegalityAnalysis 检查当前编辑状态
          </span>
        </div>
      )}

      {/* Quick Fix Buttons */}
      {fixableJudgements.length > 0 && onFix && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 500, marginBottom: 6 }}>一键修复:</div>
          <Space wrap>
            {fixableJudgements.map(j => (
              <Button key={j.fixAction} size="small" icon={<ToolOutlined />}
                type="primary" ghost
                onClick={() => onFix(j.fixAction!)}
              >
                {getFixLabel(j.fixAction!)}
              </Button>
            ))}
          </Space>
        </div>
      )}

      {/* QR Code Section */}
      {pkmDataBase64 && (
        <div style={{
          marginBottom: 12, padding: 16, background: '#fafafa',
          borderRadius: 6, border: '1px solid #f0f0f0',
        }}>
          <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 13 }}>
            <QrcodeOutlined style={{ marginRight: 6 }} />
            QR 码 — 供3DS实体游戏机扫码注入
          </div>
          <Button
            icon={<QrcodeOutlined />}
            onClick={handleGenerateQR}
            loading={qrLoading}
            type="primary"
            style={{ marginBottom: 12 }}
          >
            生成QR码
          </Button>
          {qrError && (
            <Alert type="error" message={qrError} showIcon style={{ marginBottom: 8 }} />
          )}
          {qrLoading && (
            <div style={{ textAlign: 'center', padding: 24 }}>
              <Spin tip="正在生成QR码..." />
            </div>
          )}
          {qrImageUrl && !qrLoading && (
            <div style={{ textAlign: 'center' }}>
              <Image
                src={qrImageUrl}
                alt="Pokémon QR Code"
                width={240}
                height={240}
                preview={false}
                style={{ border: '1px solid #d9d9d9', borderRadius: 8 }}
              />
              <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 6 }}>
                用3DS游戏机扫描此二维码即可接收宝可梦
              </div>
            </div>
          )}
        </div>
      )}

      {/* Detailed Judgements */}
      {judgements.length === 0 ? (
        <Empty description="点击「保存修改」后进行合法性校验" />
      ) : (
        <List
          size="small"
          dataSource={judgements}
          renderItem={j => (
            <List.Item>
              <List.Item.Meta
                avatar={
                  j.judgement === 'Invalid' ? <CloseCircleOutlined style={{ color: '#ff4d4f' }} /> :
                  j.judgement === 'Fishy' ? <WarningOutlined style={{ color: '#faad14' }} /> :
                  <CheckCircleOutlined style={{ color: '#52c41a' }} />
                }
                title={
                  <Space>
                    <Tag>{j.identifier}</Tag>
                    <Tag color={
                      j.judgement === 'Invalid' ? 'red' :
                      j.judgement === 'Fishy' ? 'orange' : 'green'
                    }>{j.judgement}</Tag>
                    {j.canFix && onFix && (
                      <Button size="small" type="link" icon={<ToolOutlined />}
                        onClick={() => onFix(j.fixAction!)}>
                        修复
                      </Button>
                    )}
                  </Space>
                }
                description={j.issue || j.comment}
              />
            </List.Item>
          )}
        />
      )}
    </div>
  );
};

function getFixLabel(action: string): string {
  switch (action) {
    case 'FixBall': return '修复球种';
    case 'FixMetLocation': return '修复相遇地点';
    case 'FixMoves': return '修复招式';
    case 'FixRelearnMoves': return '修复回忆招式';
    default: return action;
  }
}

export default LegalityTab;
