import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

export const fileApi = {
  upload: (file, onProgress) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post('/files/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: onProgress,
    })
  },

  getFile: (fileId) => api.get(`/files/${fileId}`),

  listFiles: () => api.get('/files'),

  deleteFile: (fileId) => api.delete(`/files/${fileId}`),
}

export const shareApi = {
  create: (data) => api.post('/shares', data),

  getShare: (shareCode) => api.get(`/shares/${shareCode}`),

  deactivate: (shareId) => api.post(`/shares/${shareId}/deactivate`),
}

export const downloadApi = {
  verify: (shareCode, password) =>
    api.post(`/downloads/${shareCode}/verify`, { password }),

  getDownloadUrl: (shareCode, password) => {
    let url = `/api/downloads/${shareCode}`
    if (password) {
      url += `?password=${encodeURIComponent(password)}`
    }
    return url
  },
}

export const adminApi = {
  getAllShares: () => api.get('/admin/shares'),

  deactivateShare: (shareId) => api.post(`/admin/shares/${shareId}/deactivate`),
}

export default api
