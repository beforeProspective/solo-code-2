const API_BASE_URL = ''

const getToken = () => localStorage.getItem('access_token')
const setToken = (token) => localStorage.setItem('access_token', token)
const clearToken = () => localStorage.removeItem('access_token')

const apiRequest = async (endpoint, options = {}, overrideToken = null) => {
  const token = overrideToken || getToken()
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  }
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  })
  
  if (response.status === 401 && !overrideToken) {
    clearToken()
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.detail || `Request failed with status ${response.status}`)
  }
  
  return response.json()
}

export const authAPI = {
  register: (data) => apiRequest('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  
  login: (data) => apiRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  
  getMe: (token = null) => apiRequest('/api/auth/me', {}, token),
  
  setToken,
  clearToken,
}

export const sitesAPI = {
  getAll: () => apiRequest('/api/sites'),
  
  create: (domain) => apiRequest('/api/sites', {
    method: 'POST',
    body: JSON.stringify({ domain })
  }),
  
  delete: (siteId) => apiRequest(`/api/sites/${siteId}`, {
    method: 'DELETE'
  }),
  
  getSnippet: (siteIdStr) => apiRequest(`/api/sites/${siteIdStr}/snippet`),
}

export const analyticsAPI = {
  getAnalytics: (siteId, startDate, endDate) => {
    const params = new URLSearchParams()
    if (startDate) params.append('start_date', startDate.toISOString())
    if (endDate) params.append('end_date', endDate.toISOString())
    const query = params.toString() ? `?${params.toString()}` : ''
    return apiRequest(`/api/sites/${siteId}/analytics${query}`)
  },
  
  getRealtime: (siteId) => apiRequest(`/api/sites/${siteId}/realtime`),
  
  exportCSV: (siteId, startDate, endDate) => {
    const token = getToken()
    const params = new URLSearchParams()
    if (startDate) params.append('start_date', startDate.toISOString())
    if (endDate) params.append('end_date', endDate.toISOString())
    const query = params.toString() ? `?${params.toString()}` : ''
    
    return fetch(`${API_BASE_URL}/api/sites/${siteId}/export${query}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
  },
}

export const shareAPI = {
  createShare: (siteId, expiresInDays = null) => apiRequest(`/api/share/sites/${siteId}`, {
    method: 'POST',
    body: JSON.stringify({ expires_in_days: expiresInDays })
  }),
  
  getShared: (token, startDate, endDate) => {
    const params = new URLSearchParams()
    if (startDate) params.append('start_date', startDate.toISOString())
    if (endDate) params.append('end_date', endDate.toISOString())
    const query = params.toString() ? `?${params.toString()}` : ''
    return apiRequest(`/api/share/${token}/analytics${query}`)
  },
  
  revoke: (token) => apiRequest(`/api/share/${token}`, {
    method: 'DELETE'
  }),
}
