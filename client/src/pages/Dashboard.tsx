import React from 'react';
import { Card, Row, Col, Typography, Button } from 'antd';
import { useNavigate } from 'react-router-dom';
import { UploadOutlined, BankOutlined, SaveOutlined } from '@ant-design/icons';

const { Title } = Typography;

const DashboardPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div style={{ padding: 32, maxWidth: 1200, margin: '0 auto' }}>
      <Title level={2}>工作台</Title>
      <Row gutter={[24, 24]} style={{ marginTop: 24 }}>
        <Col span={8}>
          <Card
            hoverable
            onClick={() => navigate('/saves')}
            style={{ textAlign: 'center', minHeight: 200 }}
          >
            <SaveOutlined style={{ fontSize: 48, color: '#1890ff', marginBottom: 16 }} />
            <Title level={4}>存档管理</Title>
            <p>上传和管理你的游戏存档</p>
            <Button type="primary">进入</Button>
          </Card>
        </Col>
        <Col span={8}>
          <Card
            hoverable
            onClick={() => navigate('/bank')}
            style={{ textAlign: 'center', minHeight: 200 }}
          >
            <BankOutlined style={{ fontSize: 48, color: '#52c41a', marginBottom: 16 }} />
            <Title level={4}>我的银行</Title>
            <p>在线宝可梦收藏管理</p>
            <Button type="primary">进入</Button>
          </Card>
        </Col>
        <Col span={8}>
          <Card
            hoverable
            onClick={() => navigate('/saves')}
            style={{ textAlign: 'center', minHeight: 200 }}
          >
            <UploadOutlined style={{ fontSize: 48, color: '#faad14', marginBottom: 16 }} />
            <Title level={4}>上传存档</Title>
            <p>快速上传一个新的存档文件</p>
            <Button type="primary">开始</Button>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default DashboardPage;
