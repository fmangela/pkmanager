import React from 'react';
import { Button, Form, Input, Card, Typography, App } from 'antd';
import { UserOutlined, LockOutlined, MailOutlined } from '@ant-design/icons';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/authStore';
import type { ApiError } from '../api/axios';

const { Title } = Typography;

const RegisterPage: React.FC = () => {
  const [loading, setLoading] = React.useState(false);
  const register = useAuthStore((s) => s.register);
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { t } = useTranslation(['pages', 'messages', 'common']);

  const onFinish = async (values: {
    username: string;
    email: string;
    password: string;
    confirmPassword: string;
  }) => {
    if (values.password !== values.confirmPassword) {
      message.error(t('passwordMismatch', { ns: 'messages', defaultValue: '两次密码不一致' }));
      return;
    }
    setLoading(true);
    try {
      await register(values.username, values.email, values.password);
      message.success(t('registerSuccess', { ns: 'messages', defaultValue: '注册成功，请登录' }));
      navigate('/login', { replace: true });
    } catch (err: unknown) {
      const apiError = err as ApiError;
      message.error(apiError.response?.data?.message || t('registerFailed', { ns: 'messages', defaultValue: '注册失败' }));
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
          {t('register.title', { ns: 'pages', defaultValue: '注册账号' })}
        </Title>
        <Form name="register" onFinish={onFinish} size="large">
          <Form.Item
            name="username"
            rules={[
              { required: true, message: t('register.usernameRequired', { ns: 'pages', defaultValue: '请输入用户名' }) },
              { min: 3, message: t('register.usernameMin', { ns: 'pages', defaultValue: '用户名至少3个字符' }) },
              { max: 50, message: t('register.usernameMax', { ns: 'pages', defaultValue: '用户名最多50个字符' }) },
            ]}
          >
            <Input prefix={<UserOutlined />} placeholder={t('register.usernamePlaceholder', { ns: 'pages', defaultValue: '用户名' })} />
          </Form.Item>
          <Form.Item
            name="email"
            rules={[
              { required: true, message: t('register.emailRequired', { ns: 'pages', defaultValue: '请输入邮箱' }) },
              { type: 'email', message: t('register.emailInvalid', { ns: 'pages', defaultValue: '邮箱格式不正确' }) },
            ]}
          >
            <Input prefix={<MailOutlined />} placeholder={t('register.emailPlaceholder', { ns: 'pages', defaultValue: '邮箱' })} />
          </Form.Item>
          <Form.Item
            name="password"
            rules={[
              { required: true, message: t('register.passwordRequired', { ns: 'pages', defaultValue: '请输入密码' }) },
              { min: 8, message: t('register.passwordMin', { ns: 'pages', defaultValue: '密码至少8个字符' }) },
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder={t('register.passwordPlaceholder', { ns: 'pages', defaultValue: '密码' })} />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            rules={[{ required: true, message: t('register.confirmPasswordRequired', { ns: 'pages', defaultValue: '请确认密码' }) }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder={t('register.confirmPasswordPlaceholder', { ns: 'pages', defaultValue: '确认密码' })} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>
              {t('register', { ns: 'common', defaultValue: '注册' })}
            </Button>
          </Form.Item>
          <div style={{ textAlign: 'center' }}>
            {t('register.hasAccount', { ns: 'pages', defaultValue: '已有账号？' })} <Link to="/login">{t('register.backToLogin', { ns: 'pages', defaultValue: '返回登录' })}</Link>
          </div>
        </Form>
      </Card>
    </div>
  );
};

export default RegisterPage;
