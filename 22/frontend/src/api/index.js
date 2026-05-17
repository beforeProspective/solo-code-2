import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 10000
})

export const flowApi = {
  list: () => api.get('/flows'),
  get: (id) => api.get(`/flows/${id}`),
  create: (data) => api.post('/flows', data),
  update: (id, data) => api.put(`/flows/${id}`, data),
  delete: (id) => api.delete(`/flows/${id}`),
  addNode: (flowId, data) => api.post(`/flows/${flowId}/nodes`, data),
  updateNode: (nodeId, data) => api.put(`/flows/nodes/${nodeId}`, data),
  deleteNode: (nodeId) => api.delete(`/flows/nodes/${nodeId}`),
  addEdge: (flowId, data) => api.post(`/flows/${flowId}/edges`, data),
  deleteEdge: (edgeId) => api.delete(`/flows/edges/${edgeId}`)
}

export const chatApi = {
  start: (flowId, sessionId) => api.post('/chat/start', null, {
    params: { flow_id: flowId, session_id: sessionId }
  }),
  next: (data) => api.post('/chat/next', data),
  getSubmissions: (flowId) => api.get(`/chat/submissions/${flowId}`)
}

export default api
