import React from 'react';
import { Modal, Input, Button, App } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

const { TextArea } = Input;

interface Props {
  open: boolean;
  showdownText: string;
  onClose: () => void;
}

const ShowdownExportModal: React.FC<Props> = ({ open, showdownText, onClose }) => {
  const { message } = App.useApp();
  const { t } = useTranslation(['editor', 'messages', 'common']);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(showdownText);
      message.success(t('copySuccess', { ns: 'messages', defaultValue: '已复制到剪贴板' }));
    } catch {
      message.error(t('showdownExport.copyFailed', { ns: 'editor', defaultValue: '复制失败，请手动全选复制' }));
    }
  };

  return (
    <Modal
      title={t('showdownExport.title', { ns: 'editor', defaultValue: 'Showdown 导出' })}
      open={open}
      onCancel={onClose}
      width={620}
      footer={[
        <Button key="close" onClick={onClose}>{t('close', { ns: 'common', defaultValue: '关闭' })}</Button>,
        <Button key="copy" type="primary" icon={<CopyOutlined />} onClick={handleCopy}>
          {t('showdownExport.copyOneClick', { ns: 'editor', defaultValue: '一键复制' })}
        </Button>,
      ]}
    >
      <TextArea
        value={showdownText}
        readOnly
        rows={14}
        style={{ fontFamily: 'monospace', fontSize: 13, cursor: 'text' }}
        onClick={(e: React.MouseEvent<HTMLTextAreaElement>) => (e.target as HTMLTextAreaElement).select()}
      />
    </Modal>
  );
};

export default ShowdownExportModal;
