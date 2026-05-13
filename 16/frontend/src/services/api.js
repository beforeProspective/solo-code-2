import axios from 'axios';

const API_BASE_URL = 'http://localhost:8001/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  login: (credentials) => api.post('/login', credentials),
  register: (data) => api.post('/register', data),
  logout: () => api.post('/logout'),
  refresh: () => api.post('/refresh'),
  me: () => api.get('/me'),
};

export const accountApi = {
  getAll: () => api.get('/accounts'),
  getById: (id) => api.get(`/accounts/${id}`),
  create: (data) => api.post('/accounts', data),
  update: (id, data) => api.put(`/accounts/${id}`, data),
  delete: (id) => api.delete(`/accounts/${id}`),
};

export const transactionApi = {
  getAll: (params = {}) => api.get('/transactions', { params }),
  getById: (id) => api.get(`/transactions/${id}`),
  create: (data) => api.post('/transactions', data),
  update: (id, data) => api.put(`/transactions/${id}`, data),
  delete: (id) => api.delete(`/transactions/${id}`),
};

export const categoryApi = {
  getAll: () => api.get('/categories'),
  create: (data) => api.post('/categories', data),
  update: (id, data) => api.put(`/categories/${id}`, data),
  delete: (id) => api.delete(`/categories/${id}`),
};

export const tagApi = {
  getAll: () => api.get('/tags'),
  create: (data) => api.post('/tags', data),
  update: (id, data) => api.put(`/tags/${id}`, data),
  delete: (id) => api.delete(`/tags/${id}`),
};

export const budgetApi = {
  getAll: () => api.get('/budgets'),
  create: (data) => api.post('/budgets', data),
  update: (id, data) => api.put(`/budgets/${id}`, data),
  delete: (id) => api.delete(`/budgets/${id}`),
};

export const billApi = {
  getAll: (params = {}) => api.get('/bills', { params }),
  create: (data) => api.post('/bills', data),
  update: (id, data) => api.put(`/bills/${id}`, data),
  markAsPaid: (id) => api.post(`/bills/${id}/mark-paid`),
  delete: (id) => api.delete(`/bills/${id}`),
};

export const ruleApi = {
  getAll: () => api.get('/rules'),
  create: (data) => api.post('/rules', data),
  update: (id, data) => api.put(`/rules/${id}`, data),
  delete: (id) => api.delete(`/rules/${id}`),
};

export const reportApi = {
  summary: (params = {}) => api.get('/reports/summary', { params }),
  trend: (params = {}) => api.get('/reports/trend', { params }),
  byCategory: (params = {}) => api.get('/reports/by-category', { params }),
  netWorth: (params = {}) => api.get('/reports/net-worth', { params }),
  accountBalances: () => api.get('/reports/account-balances'),
};

export const currencyApi = {
  getAll: () => api.get('/currencies'),
  convert: (data) => api.post('/currencies/convert', data),
  updateRates: () => api.post('/currencies/update-rates'),
};

export const dataApi = {
  export: (format = 'json') => api.get(`/data/export?format=${format}`, { responseType: 'blob' }),
  import: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/data/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

export default api;
