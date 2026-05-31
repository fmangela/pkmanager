import axios from 'axios';

const apiClient = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器: 自动注入 JWT token
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截器: 解包 ApiResponse，处理错误格式，401 → 清除 token
apiClient.interceptors.response.use(
  (response) => {
    const body = response.data;

    // 后端统一返回 ApiResponse<T> { code, message, data }
    if (body && typeof body === 'object' && 'code' in body && 'data' in body) {
      if (body.code !== 0) {
        return Promise.reject({
          response: { status: body.code, data: { message: body.message } }
        });
      }
      response.data = body.data;
      return response;
    }

    return response;
  },
  (error) => {
    // 处理 ASP.NET Core 自动验证错误 (ProblemDetails 格式)
    const data = error.response?.data;
    if (data?.errors && typeof data.errors === 'object') {
      // 提取第一条验证错误信息
      const firstKey = Object.keys(data.errors)[0];
      const firstError = Array.isArray(data.errors[firstKey])
        ? data.errors[firstKey][0]
        : data.errors[firstKey];
      error.response.data = { message: firstError || data.title || '请求参数不合法' };
    }

    // 如果响应是 ApiResponse 格式的错误
    if (data?.message && data?.code) {
      error.response.data = { message: data.message };
    }

    if (error.response?.status === 401) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default apiClient;
