const API_BASE = '/api';

const getToken = () => localStorage.getItem('token');

const request = async (endpoint, options = {}) => {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });
  
  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }
  
  if (response.status === 204) return null;
  return response.json();
};

export const authAPI = {
  login: (email, password) => request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  }),
  register: (email, password, name) => request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, name })
  }),
  me: () => request('/auth/me')
};

export const projectAPI = {
  getAll: () => request('/projects'),
  get: (id) => request(`/projects/${id}`),
  create: (data) => request('/projects', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  update: (id, data) => request(`/projects/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),
  delete: (id) => request(`/projects/${id}`, {
    method: 'DELETE'
  }),
  getMembers: (id) => request(`/projects/${id}/members`),
  addMember: (id, email, role) => request(`/projects/${id}/members`, {
    method: 'POST',
    body: JSON.stringify({ email, role })
  }),
  removeMember: (id, memberId) => request(`/projects/${id}/members/${memberId}`, {
    method: 'DELETE'
  })
};

export const milestoneAPI = {
  getAll: (projectId) => request(`/projects/${projectId}/milestones`),
  create: (projectId, data) => request(`/projects/${projectId}/milestones`, {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  update: (id, data) => request(`/milestones/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),
  delete: (id) => request(`/milestones/${id}`, {
    method: 'DELETE'
  })
};

export const taskAPI = {
  getAll: (projectId) => request(`/projects/${projectId}/tasks`),
  get: (id) => request(`/tasks/${id}`),
  create: (projectId, data) => request(`/projects/${projectId}/tasks`, {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  update: (id, data) => request(`/tasks/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),
  updateStatus: (id, status) => request(`/tasks/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status })
  }),
  delete: (id) => request(`/tasks/${id}`, {
    method: 'DELETE'
  })
};

export const commentAPI = {
  getAll: (taskId) => request(`/tasks/${taskId}/comments`),
  create: (taskId, content) => request(`/tasks/${taskId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ content })
  }),
  update: (id, content) => request(`/comments/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ content })
  }),
  delete: (id) => request(`/comments/${id}`, {
    method: 'DELETE'
  })
};

export const attachmentAPI = {
  getAll: (taskId) => request(`/tasks/${taskId}/attachments`),
  create: (taskId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return request(`/tasks/${taskId}/attachments`, {
      method: 'POST',
      headers: {},
      body: formData
    });
  },
  download: (id) => `${API_BASE}/attachments/${id}/download`,
  delete: (id) => request(`/attachments/${id}`, {
    method: 'DELETE'
  })
};

export const dashboardAPI = {
  getStats: () => request('/dashboard/stats'),
  getActivity: () => request('/dashboard/activity'),
  getUsers: () => request('/users')
};

export const searchAPI = {
  search: (query) => request(`/search?q=${encodeURIComponent(query)}`)
};

export default {
  authAPI,
  projectAPI,
  milestoneAPI,
  taskAPI,
  commentAPI,
  attachmentAPI,
  dashboardAPI,
  searchAPI
};
