import api from './index'

export const generateShoppingList = (params) => api.get('/shopping-list/generate', { params })
export const getShoppingList = (params = {}) => api.get('/shopping-list', { params })
export const markPurchased = (id, purchased) => api.post(`/shopping-list/${id}/purchased`, { purchased })
