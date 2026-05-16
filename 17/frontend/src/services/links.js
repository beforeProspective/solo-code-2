import api from './api'

export const linksService = {
  getAll(params = {}) {
    return api.get('/links', { params })
  },

  get(id) {
    return api.get(`/links/${id}`)
  },

  create(data) {
    return api.post('/links', data)
  },

  createPublic(data) {
    return api.post('/links/public', data)
  },

  update(id, data) {
    return api.put(`/links/${id}`, data)
  },

  delete(id) {
    return api.delete(`/links/${id}`)
  },

  toggle(id) {
    return api.post(`/links/${id}/toggle`)
  },

  getStats(id) {
    return api.get(`/links/${id}/stats`)
  },

  getQrCode(id) {
    return api.get(`/links/${id}/qrcode`, { responseType: 'blob' })
  }
}

export const statsService = {
  getOverview() {
    return api.get('/stats/overview')
  },

  getTrends(days = 30) {
    return api.get('/stats/trends', { params: { days } })
  },

  getReferrers() {
    return api.get('/stats/referrers')
  }
}

export const apiKeysService = {
  getAll() {
    return api.get('/api-keys')
  },

  create(data) {
    return api.post('/api-keys', data)
  },

  delete(id) {
    return api.delete(`/api-keys/${id}`)
  }
}

export const usersService = {
  getAll(params = {}) {
    return api.get('/users', { params })
  },

  get(id) {
    return api.get(`/users/${id}`)
  },

  create(data) {
    return api.post('/users', data)
  },

  update(id, data) {
    return api.put(`/users/${id}`, data)
  },

  delete(id) {
    return api.delete(`/users/${id}`)
  }
}
