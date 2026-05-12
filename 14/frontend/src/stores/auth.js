import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '../services/api'

const API_BASE = 'http://localhost:8000/api'

async function fetchJson(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...options.headers
  }
  
  const token = localStorage.getItem('token')
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  
  console.log('Fetch request:', url, options.body)
  
  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'omit'
  })
  
  const data = await response.json()
  console.log('Fetch response:', data)
  
  if (!response.ok) {
    const error = new Error(data.message || 'Request failed')
    error.response = { data, status: response.status }
    throw error
  }
  
  return data
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref(JSON.parse(localStorage.getItem('user') || 'null'))
  const token = ref(localStorage.getItem('token'))
  const loading = ref(false)
  const error = ref(null)

  const isAuthenticated = computed(() => !!token.value)

  async function login(credentials) {
    loading.value = true
    error.value = null
    try {
      const payload = {
        email: credentials.email,
        password: credentials.password
      }
      const data = await fetchJson(`${API_BASE}/login`, {
        method: 'POST',
        body: JSON.stringify(payload)
      })
      token.value = data.token
      user.value = data.user
      localStorage.setItem('token', data.token)
      localStorage.setItem('user', JSON.stringify(data.user))
      return data
    } catch (e) {
      error.value = e.response?.data?.message || 'Login failed'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function register(data) {
    loading.value = true
    error.value = null
    try {
      const payload = {
        name: data.name,
        email: data.email,
        password: data.password,
        password_confirmation: data.password_confirmation,
        organization: data.organization || null,
        phone: data.phone || null
      }
      const response = await fetchJson(`${API_BASE}/register`, {
        method: 'POST',
        body: JSON.stringify(payload)
      })
      token.value = response.token
      user.value = response.user
      localStorage.setItem('token', response.token)
      localStorage.setItem('user', JSON.stringify(response.user))
      return response
    } catch (e) {
      error.value = e.response?.data?.message || 'Registration failed'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function logout() {
    try {
      await fetchJson(`${API_BASE}/logout`, { method: 'POST' })
    } catch (e) {
      console.error('Logout error:', e)
    } finally {
      token.value = null
      user.value = null
      localStorage.removeItem('token')
      localStorage.removeItem('user')
    }
  }

  async function refresh() {
    try {
      const data = await fetchJson(`${API_BASE}/refresh`, { method: 'POST' })
      token.value = data.token
      localStorage.setItem('token', data.token)
    } catch (e) {
      logout()
    }
  }

  async function getCurrentUser() {
    try {
      const data = await fetchJson(`${API_BASE}/me`, { method: 'GET' })
      user.value = data
      localStorage.setItem('user', JSON.stringify(data))
      return data
    } catch (e) {
      logout()
      throw e
    }
  }

  async function updateProfile(data) {
    loading.value = true
    try {
      const response = await fetchJson(`${API_BASE}/profile`, {
        method: 'PUT',
        body: JSON.stringify(data)
      })
      user.value = response.user
      localStorage.setItem('user', JSON.stringify(response.user))
      return response
    } finally {
      loading.value = false
    }
  }

  return {
    user,
    token,
    loading,
    error,
    isAuthenticated,
    login,
    register,
    logout,
    refresh,
    getCurrentUser,
    updateProfile
  }
})
