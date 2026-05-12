import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '../services/api'

export const useEventStore = defineStore('event', () => {
  const events = ref([])
  const currentEvent = ref(null)
  const loading = ref(false)
  const error = ref(null)
  const pagination = ref({ total: 0, currentPage: 1, lastPage: 1 })

  async function fetchEvents() {
    loading.value = true
    error.value = null
    try {
      const response = await api.get('/events')
      events.value = response.data.data
      pagination.value = {
        total: response.data.total,
        currentPage: response.data.current_page,
        lastPage: response.data.last_page
      }
      return events.value
    } catch (e) {
      error.value = e.response?.data?.message || 'Failed to fetch events'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function fetchEvent(id) {
    loading.value = true
    error.value = null
    try {
      const response = await api.get(`/events/${id}`)
      currentEvent.value = response.data
      return response.data
    } catch (e) {
      error.value = e.response?.data?.message || 'Failed to fetch event'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function createEvent(data) {
    loading.value = true
    error.value = null
    try {
      const response = await api.post('/events', data)
      return response.data
    } catch (e) {
      error.value = e.response?.data?.message || 'Failed to create event'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function updateEvent(id, data) {
    loading.value = true
    error.value = null
    try {
      const response = await api.put(`/events/${id}`, data)
      return response.data
    } catch (e) {
      error.value = e.response?.data?.message || 'Failed to update event'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function deleteEvent(id) {
    loading.value = true
    error.value = null
    try {
      await api.delete(`/events/${id}`)
    } catch (e) {
      error.value = e.response?.data?.message || 'Failed to delete event'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function uploadImage(file) {
    const formData = new FormData()
    formData.append('image', file)
    try {
      const response = await api.post('/events/upload-image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      return response.data
    } catch (e) {
      throw e
    }
  }

  return {
    events,
    currentEvent,
    loading,
    error,
    pagination,
    fetchEvents,
    fetchEvent,
    createEvent,
    updateEvent,
    deleteEvent,
    uploadImage
  }
})
