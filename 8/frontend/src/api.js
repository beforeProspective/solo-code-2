import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' }
})

export const customersAPI = {
  getAll: () => api.get('/customers'),
  get: (id) => api.get(`/customers/${id}`),
  create: (data) => api.post('/customers', data),
  update: (id, data) => api.put(`/customers/${id}`, data),
  delete: (id) => api.delete(`/customers/${id}`)
}

export const taxesAPI = {
  getAll: () => api.get('/taxes')
}

export const invoicesAPI = {
  getAll: (status) => api.get('/invoices', { params: { status } }),
  get: (id) => api.get(`/invoices/${id}`),
  create: (data) => api.post('/invoices', data),
  updateStatus: (id, status) => api.put(`/invoices/${id}/status`, { status }),
  addPayment: (id, data) => api.post(`/invoices/${id}/payments`, data),
  downloadPdf: (id) => window.open(`/api/invoices/${id}/pdf`, '_blank')
}

export const statsAPI = {
  get: (year) => api.get('/statistics', { params: { year } })
}

export const remindersAPI = {
  check: () => api.post('/reminders/check'),
  getAll: () => api.get('/reminders')
}
