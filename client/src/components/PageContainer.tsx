// ── PageContainer ────────────────────────────────────────────────
// 统一的页面容器组件，提供一致的 header（返回按钮 + 标题 + 操作区）
// 和内容区布局，消除各页面重复的 wrapper pattern。
//
// 用法:
//   <PageContainer title="存档管理" backTo="/dashboard" extra={<Button>操作</Button>}>
//     {page content}
//   </PageContainer>

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Typography, Space } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

const { Title } = Typography;

interface PageContainerProps {
  title?: React.ReactNode;
  extra?: React.ReactNode;
  /** 返回路由，不传则不显示返回按钮 */
  backTo?: string;
  maxWidth?: number;
  children: React.ReactNode;
}

const PageContainer: React.FC<PageContainerProps> = ({
  title,
  extra,
  backTo,
  maxWidth = 1200,
  children,
}) => {
  const navigate = useNavigate();
  const { t } = useTranslation('common');

  return (
    <div className="page-container" style={{ maxWidth }}>
      <div className="page-container__header">
        <Space align="center" size={10} className="page-container__heading">
          {backTo && (
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate(backTo)}
              size="small"
            >
              {t('back', '返回')}
            </Button>
          )}
          {title && (
            <Title level={3} className="page-container__title">{title}</Title>
          )}
        </Space>
        {extra && <div className="page-container__extra">{extra}</div>}
      </div>

      <div className="page-container__content">{children}</div>
    </div>
  );
};

export default PageContainer;
