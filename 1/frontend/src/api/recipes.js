import api from './index'

export const getRecipes = () => api.get('/recipes')
export const getRecipe = (id) => api.get(`/recipes/${id}`)
export const createRecipe = (data) => api.post('/recipes', data)
export const updateRecipe = (id, data) => api.put(`/recipes/${id}`, data)
export const deleteRecipe = (id) => api.delete(`/recipes/${id}`)
