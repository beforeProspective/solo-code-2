import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
  paramsSerializer: {
    indexes: null
  }
})

export const beansAPI = {
  getAll: () => api.get('/beans/'),
  getById: (id) => api.get(`/beans/${id}/`),
  create: (data) => api.post('/beans/', data),
  update: (id, data) => api.put(`/beans/${id}/`, data),
  delete: (id) => api.delete(`/beans/${id}/`),
  search: (q) => api.get(`/beans/search/?q=${q}`)
}

export const suppliersAPI = {
  getAll: () => api.get('/suppliers/'),
  getById: (id) => api.get(`/suppliers/${id}/`),
  create: (data) => api.post('/suppliers/', data),
  update: (id, data) => api.put(`/suppliers/${id}/`, data),
  delete: (id) => api.delete(`/suppliers/${id}/`)
}

export const roastingAPI = {
  getAll: () => api.get('/roasting/'),
  getById: (id) => api.get(`/roasting/${id}/`),
  create: (data) => api.post('/roasting/', data),
  update: (id, data) => api.put(`/roasting/${id}/`, data),
  delete: (id) => api.delete(`/roasting/${id}/`),
  getByBean: (beanId) => api.get(`/roasting/by_bean/?bean_id=${beanId}`)
}

export const cuppingAPI = {
  getAll: () => api.get('/cupping/'),
  getById: (id) => api.get(`/cupping/${id}/`),
  create: (data) => api.post('/cupping/', data),
  update: (id, data) => api.put(`/cupping/${id}/`, data),
  delete: (id) => api.delete(`/cupping/${id}/`),
  getByRoast: (roastId) => api.get(`/cupping/by_roast/?roast_id=${roastId}`)
}

export const maintenanceAPI = {
  getRoasters: () => api.get('/maintenance/roasters/'),
  getRoasterById: (id) => api.get(`/maintenance/roasters/${id}/`),
  createRoaster: (data) => api.post('/maintenance/roasters/', data),
  updateRoaster: (id, data) => api.put(`/maintenance/roasters/${id}/`, data),
  deleteRoaster: (id) => api.delete(`/maintenance/roasters/${id}/`),
  getRecords: () => api.get('/maintenance/records/'),
  getRecordById: (id) => api.get(`/maintenance/records/${id}/`),
  createRecord: (data) => api.post('/maintenance/records/', data),
  updateRecord: (id, data) => api.put(`/maintenance/records/${id}/`, data),
  deleteRecord: (id) => api.delete(`/maintenance/records/${id}/`),
  getRecordsByRoaster: (roasterId) => api.get(`/maintenance/records/by_roaster/?roaster_id=${roasterId}`)
}

export const comparisonAPI = {
  compareRoasts: (batchIds) => api.get('/comparison/roasts/', {
    params: { batch_ids: batchIds }
  })
}

export default api
