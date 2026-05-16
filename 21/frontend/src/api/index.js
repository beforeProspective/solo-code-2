import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000
})

export const contractApi = {
  upload: (formData) => api.post('/contracts/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  
  list: () => api.get('/contracts'),
  
  get: (id) => api.get(`/contracts/${id}`),
  
  addSigners: (id, data) => api.post(`/contracts/${id}/signers`, data),
  
  getSigners: (id) => api.get(`/contracts/${id}/signers`),
  
  getPage: (id, pageNum) => api.get(`/contracts/${id}/page/${pageNum}`, {
    responseType: 'blob'
  }),
  
  download: (id) => api.get(`/contracts/${id}/download`, {
    responseType: 'blob'
  })
}

export const signApi = {
  getInfo: (token) => api.get(`/sign/${token}`),
  
  getPage: (token, pageNum) => api.get(`/sign/${token}/page/${pageNum}`, {
    responseType: 'blob'
  }),
  
  submit: (token, data) => api.post(`/sign/${token}`, data)
}

export default api
