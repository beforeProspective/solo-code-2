import axios from 'axios'

const api = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json'
  }
})

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export const authApi = {
  login: (credentials) => api.post('/auth/login', credentials),
  register: (data) => api.post('/auth/register', data),
  me: () => api.get('/auth/me')
}

export const componentApi = {
  getAll: (params = {}) => api.get('/components', { params }),
  getById: (id) => api.get(`/components/${id}`),
  create: (data) => api.post('/components', data),
  update: (id, data) => api.put(`/components/${id}`, data),
  delete: (id) => api.delete(`/components/${id}`),
  getCategories: () => api.get('/components/categories'),
  getPackages: () => api.get('/components/packages')
}

export const supplierApi = {
  getAll: (params = {}) => api.get('/suppliers', { params }),
  getById: (id) => api.get(`/suppliers/${id}`),
  create: (data) => api.post('/suppliers', data),
  update: (id, data) => api.put(`/suppliers/${id}`, data),
  delete: (id) => api.delete(`/suppliers/${id}`)
}

export const bomApi = {
  getAll: (params = {}) => api.get('/boms', { params }),
  getById: (id) => api.get(`/boms/${id}`),
  create: (data) => api.post('/boms', data),
  update: (id, data) => api.put(`/boms/${id}`, data),
  delete: (id) => api.delete(`/boms/${id}`),
  export: (id) => api.get(`/boms/${id}/export`, { responseType: 'blob' })
}

export const statsApi = {
  getOverview: () => api.get('/stats/overview'),
  getByCategory: () => api.get('/stats/by-category'),
  getByPackage: () => api.get('/stats/by-package'),
  getLowStock: (params = {}) => api.get('/stats/low-stock', { params }),
  getBySupplier: () => api.get('/stats/by-supplier'),
  getRecent: (params = {}) => api.get('/stats/recent', { params })
}

export default api
