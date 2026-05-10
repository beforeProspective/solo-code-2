import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const lensService = {
  getAll: () => api.get('/lenses'),
  getById: (id) => api.get(`/lenses/${id}`),
  create: (data) => api.post('/lenses', data),
  update: (id, data) => api.put(`/lenses/${id}`, data),
  delete: (id) => api.delete(`/lenses/${id}`),
};

export const adapterService = {
  getAll: () => api.get('/adapters'),
  getById: (id) => api.get(`/adapters/${id}`),
  create: (data) => api.post('/adapters', data),
  update: (id, data) => api.put(`/adapters/${id}`, data),
  delete: (id) => api.delete(`/adapters/${id}`),
  findCompatible: (fromMount, toMount) => 
    api.get('/adapters/compatible', { params: { fromMount, toMount } }),
};

export const samplePhotoService = {
  getAll: (lensId) => api.get('/sample-photos', { params: { lensId } }),
  getById: (id) => api.get(`/sample-photos/${id}`),
  create: (data) => api.post('/sample-photos', data),
  update: (id, data) => api.put(`/sample-photos/${id}`, data),
  delete: (id) => api.delete(`/sample-photos/${id}`),
};

export const maintenanceService = {
  getAll: (lensId) => api.get('/maintenance-records', { params: { lensId } }),
  getById: (id) => api.get(`/maintenance-records/${id}`),
  create: (data) => api.post('/maintenance-records', data),
  update: (id, data) => api.put(`/maintenance-records/${id}`, data),
  delete: (id) => api.delete(`/maintenance-records/${id}`),
  getOverdue: () => api.get('/maintenance-records/overdue'),
  getReminders: (days) => api.get('/maintenance-records/reminders', { params: { days } }),
};

export default api;
