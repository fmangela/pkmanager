import React from 'react';
import { Button, Form, Input, Card, Typography, App } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/authStore';
import type { ApiError } from '../api/axios';

const { Title } = Typography;

const LoginPage: React.FC = () => {
  const [loading, setLoading] = React.useState(false);
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { t } = useTranslation(['pages', 'messages', 'common']);

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      await login(values.username, values.password);
      message.success(t('loginSuccess', { ns: 'messages', defaultValue: '登录成功' }));
      navigate('/dashboard', { replace: true });
    } catch (err: unknown) {
      const apiError = err as ApiError;
      message.error(apiError.response?.data?.message || t('loginFailed', { ns: 'messages', defaultValue: '登录失败' }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    }}>
      <Card style={{ maxWidth: 400, width: '90%', margin: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
        <Title level={3} style={{ textAlign: 'center', marginBottom: 32 }}>
          {t('login.appTitle', { ns: 'pages', defaultValue: '宝可梦管理平台' })}
        </Title>
        <Form name="login" onFinish={onFinish} size="large">
          <Form.Item
            name="username"
            rules={[{ required: true, message: t('login.usernameRequired', { ns: 'pages', defaultValue: '请输入用户名' }) }]}
          >
            <Input prefix={<UserOutlined />} placeholder={t('login.usernamePlaceholder', { ns: 'pages', defaultValue: '用户名' })} />
          </Form.Item>
          <Form.Item
            name="password"
            rules={[{ required: true, message: t('login.passwordRequired', { ns: 'pages', defaultValue: '请输入密码' }) }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder={t('login.passwordPlaceholder', { ns: 'pages', defaultValue: '密码' })} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>
              {t('login', { ns: 'common', defaultValue: '登录' })}
            </Button>
          </Form.Item>
          <div style={{ textAlign: 'center' }}>
            {t('login.noAccount', { ns: 'pages', defaultValue: '还没有账号？' })} <Link to="/register">{t('login.registerNow', { ns: 'pages', defaultValue: '立即注册' })}</Link>
          </div>
        </Form>
      </Card>
    </div>
  );
};

export default LoginPage;
