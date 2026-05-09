import api from './index'

export const getConsumptionRecords = (params = {}) => api.get('/consumption-records', { params })
export const getConsumptionRecord = (id) => api.get(`/consumption-records/${id}`)
export const createConsumptionRecord = (data) => api.post('/consumption-records', data)
export const deleteConsumptionRecord = (id) => api.delete(`/consumption-records/${id}`)
export const getIngredientHistory = (ingredientId) => api.get(`/consumption-records/ingredient/${ingredientId}`)
