import api from './index'

export const getMealPlans = (params = {}) => api.get('/meal-plans', { params })
export const getMealPlan = (id) => api.get(`/meal-plans/${id}`)
export const createMealPlan = (data) => api.post('/meal-plans', data)
export const updateMealPlan = (id, data) => api.put(`/meal-plans/${id}`, data)
export const deleteMealPlan = (id) => api.delete(`/meal-plans/${id}`)
