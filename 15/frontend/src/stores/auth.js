import { defineStore } from 'pinia'
import api from '@/api'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem('token') || null,
    user: JSON.parse(localStorage.getItem('user') || 'null')
  }),

  getters: {
    isAuthenticated: (state) => !!state.token
  },

  actions: {
    async login(credentials) {
      const response = await api.post('/login', credentials)
      this.token = response.data.access_token
      this.user = response.data.user
      localStorage.setItem('token', this.token)
      localStorage.setItem('user', JSON.stringify(this.user))
      return response.data
    },

    async register(data) {
      const response = await api.post('/register', data)
      this.token = response.data.access_token
      this.user = response.data.user
      localStorage.setItem('token', this.token)
      localStorage.setItem('user', JSON.stringify(this.user))
      return response.data
    },

    async logout() {
      if (this.token) {
        try {
          await api.post('/logout')
        } catch (e) {
          console.log(e)
        }
      }
      this.token = null
      this.user = null
      localStorage.removeItem('token')
      localStorage.removeItem('user')
    }
  }
})
