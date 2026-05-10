import axios from 'axios';

const API_BASE = 'http://localhost:8000/api';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const cabinetAPI = {
  getAll: () => api.get('/cabinets.php'),
  getById: (id) => api.get(`/cabinets.php?id=${id}`),
  create: (data) => api.post('/cabinets.php', data),
  update: (id, data) => api.put(`/cabinets.php?id=${id}`, data),
  delete: (id) => api.delete(`/cabinets.php?id=${id}`),
};

export const deviceAPI = {
  getAll: (params = {}) => {
    const searchParams = new URLSearchParams(params).toString();
    return api.get(`/devices.php${searchParams ? '?' + searchParams : ''}`);
  },
  getById: (id) => api.get(`/devices.php?id=${id}`),
  search: (keyword) => api.get(`/devices.php?search=${encodeURIComponent(keyword)}`),
  create: (data) => api.post('/devices.php', data),
  update: (id, data) => api.put(`/devices.php?id=${id}`, data),
  delete: (id) => api.delete(`/devices.php?id=${id}`),
};

export const connectionAPI = {
  getAll: () => api.get('/connections.php'),
  getByDevice: (deviceId) => api.get(`/connections.php?device_id=${deviceId}`),
  create: (data) => api.post('/connections.php', data),
  update: (id, data) => api.put(`/connections.php?id=${id}`, data),
  delete: (id) => api.delete(`/connections.php?id=${id}`),
};

export const statsAPI = {
  getStats: () => api.get('/stats.php'),
};

export const labelAPI = {
  generate: (deviceIds) => api.get(`/label.php?device_ids=${deviceIds.join(',')}`),
};

export default api;
