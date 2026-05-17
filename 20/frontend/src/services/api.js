import axios from 'axios';

const API_BASE_URL = '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const authAPI = {
  login: (username, password) =>
    api.post('/auth/login', { username, password }).then((res) => res.data),
  register: (username, password) =>
    api.post('/auth/register', { username, password }).then((res) => res.data),
};

export const feedbackAPI = {
  getFeedbacks: (status = 'all') =>
    api.get(`/feedbacks?status=${status}`).then((res) => res.data),
  getFeedback: (id) =>
    api.get(`/feedbacks/${id}`).then((res) => res.data),
  createFeedback: (title, description) =>
    api.post('/feedbacks', { title, description }).then((res) => res.data),
  voteFeedback: (id) =>
    api.post(`/feedbacks/${id}/vote`).then((res) => res.data),
  unvoteFeedback: (id) =>
    api.delete(`/feedbacks/${id}/vote`).then((res) => res.data),
  hasVoted: (id) =>
    api.get(`/feedbacks/${id}/voted`).then((res) => res.data),
  updateStatus: (id, status) =>
    api.put(`/feedbacks/${id}/status`, { status }).then((res) => res.data),
  deleteFeedback: (id) =>
    api.delete(`/feedbacks/${id}`).then((res) => res.data),
};

export default api;
