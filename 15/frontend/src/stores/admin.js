import { defineStore } from 'pinia'
import api from '@/api'

export const useAdminStore = defineStore('admin', {
  state: () => ({
    stats: null,
    components: [],
    incidents: [],
    maintenances: [],
    subscribers: [],
    webhooks: [],
    metrics: []
  }),

  actions: {
    async fetchStats() {
      const response = await api.get('/dashboard')
      this.stats = response.data
    },

    async fetchComponents() {
      const response = await api.get('/components')
      this.components = response.data.components
    },

    async createComponent(data) {
      return await api.post('/components', data)
    },

    async updateComponent(id, data) {
      return await api.put(`/components/${id}`, data)
    },

    async deleteComponent(id) {
      return await api.delete(`/components/${id}`)
    },

    async updateComponentStatus(id, status, statusLabel = null) {
      const data = { status }
      if (statusLabel) data.status_label = statusLabel
      return await api.post(`/components/${id}/status`, data)
    },

    async fetchIncidents(maintenance = false) {
      const response = await api.get(`/incidents?maintenance=${maintenance}`)
      if (maintenance) {
        this.maintenances = response.data.data
      } else {
        this.incidents = response.data.data
      }
    },

    async createIncident(data) {
      return await api.post('/incidents', data)
    },

    async updateIncident(id, data) {
      return await api.put(`/incidents/${id}`, data)
    },

    async deleteIncident(id) {
      return await api.delete(`/incidents/${id}`)
    },

    async addIncidentUpdate(id, data) {
      return await api.post(`/incidents/${id}/updates`, data)
    },

    async fetchSubscribers() {
      const response = await api.get('/subscribers')
      this.subscribers = response.data.data
    },

    async deleteSubscriber(id) {
      return await api.delete(`/subscribers/${id}`)
    },

    async fetchWebhooks() {
      const response = await api.get('/webhooks')
      this.webhooks = response.data
    },

    async createWebhook(data) {
      return await api.post('/webhooks', data)
    },

    async updateWebhook(id, data) {
      return await api.put(`/webhooks/${id}`, data)
    },

    async deleteWebhook(id) {
      return await api.delete(`/webhooks/${id}`)
    },

    async fetchMetrics() {
      const response = await api.get('/metrics')
      this.metrics = response.data
    },

    async createMetric(data) {
      return await api.post('/metrics', data)
    },

    async updateMetric(id, data) {
      return await api.put(`/metrics/${id}`, data)
    },

    async deleteMetric(id) {
      return await api.delete(`/metrics/${id}`)
    },

    async addMetricPoint(id, data) {
      return await api.post(`/metrics/${id}/points`, data)
    },

    async updateTheme(data) {
      return await api.put('/settings/theme', data)
    }
  }
})
