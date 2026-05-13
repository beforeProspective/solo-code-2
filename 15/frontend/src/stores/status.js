import { defineStore } from 'pinia'
import api from '@/api'

export const useStatusStore = defineStore('status', {
  state: () => ({
    status: null,
    components: [],
    groupedComponents: {},
    openIncidents: [],
    scheduledMaintenances: [],
    pastIncidents: [],
    theme: {
      site_name: 'Status Page',
      logo: null,
      primary_color: '#3B82F6',
      secondary_color: '#1E40AF',
      background_color: '#F3F4F6',
      header_color: '#1F2937',
      footer_text: '© 2024 Status Page',
      custom_html: null
    }
  }),

  actions: {
    async fetchStatus() {
      const response = await api.get('/status')
      this.status = response.data.overall_status
      this.components = response.data.components
      this.groupedComponents = response.data.grouped_components || {}
      this.openIncidents = response.data.open_incidents
      this.scheduledMaintenances = response.data.scheduled_maintenances
      this.pastIncidents = response.data.past_incidents
    },

    async fetchTheme() {
      const response = await api.get('/theme')
      this.theme = response.data.theme
    },

    async fetchComponents() {
      const response = await api.get('/components')
      this.components = response.data.components
      this.groupedComponents = response.data.grouped || {}
    }
  }
})
