import React from 'react';
import { Modal, Input, Button, App } from 'antd';
import { CopyOutlined } from '@ant-design/icons';

const { TextArea } = Input;

interface Props {
  open: boolean;
  showdownText: string;
  onClose: () => void;
}

const ShowdownExportModal: React.FC<Props> = ({ open, showdownText, onClose }) => {
  const { message } = App.useApp();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(showdownText);
      message.success('已复制到剪贴板');
    } catch {
      message.error('复制失败，请手动全选复制');
    }
  };

  return (
    <Modal
      title="Showdown 导出"
      open={open}
      onCancel={onClose}
      width={620}
      footer={[
        <Button key="close" onClick={onClose}>关闭</Button>,
        <Button key="copy" type="primary" icon={<CopyOutlined />} onClick={handleCopy}>
          一键复制
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
