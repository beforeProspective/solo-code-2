import { defineStore } from 'pinia'
import api from '../api'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem('token') || '',
    user: JSON.parse(localStorage.getItem('user') || 'null')
  }),
  
  getters: {
    isAuthenticated: (state) => !!state.token,
    userRole: (state) => state.user?.role || '',
    isAdmin: (state) => state.user?.role === 'admin',
    isEditable: (state) => ['admin', 'user'].includes(state.user?.role)
  },
  
  actions: {
    async login(username, password) {
      try {
        const response = await api.post('/auth?action=login', { username, password })
        const { token, user } = response.data
        this.token = token
        this.user = user
        localStorage.setItem('token', token)
        localStorage.setItem('user', JSON.stringify(user))
        return { success: true }
      } catch (error) {
        return { success: false, error: error.response?.data?.error || '登录失败' }
      }
    },
    
    async register(username, email, password) {
      try {
        await api.post('/auth?action=register', { username, email, password })
        return { success: true }
      } catch (error) {
        return { success: false, error: error.response?.data?.error || '注册失败' }
      }
    },
    
    async fetchCurrentUser() {
      try {
        const response = await api.post('/auth?action=me')
        this.user = response.data.user
        localStorage.setItem('user', JSON.stringify(response.data.user))
        return response.data.user
      } catch (error) {
        this.logout()
        return null
      }
    },
    
    logout() {
      this.token = ''
      this.user = null
      localStorage.removeItem('token')
      localStorage.removeItem('user')
    }
  }
})
