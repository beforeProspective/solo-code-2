import { create } from 'zustand';
import api from '../lib/api';

const useAuthStore = create((set, get) => ({
  user: null,
  token: localStorage.getItem('token') || null,
  isLoading: false,
  error: null,

  init: () => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      set({ user: JSON.parse(storedUser) });
    }
  },

  register: async (userData) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.post('/auth/register', userData);
      const { access_token, user } = response.data;
      localStorage.setItem('token', access_token);
      localStorage.setItem('user', JSON.stringify(user));
      set({ user, token: access_token, isLoading: false });
      return { success: true };
    } catch (error) {
      set({
        error: error.response?.data?.detail || '注册失败',
        isLoading: false,
      });
      return { success: false, error: error.response?.data?.detail || '注册失败' };
    }
  },

  login: async (username, password) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.post('/auth/login/json', {
        username,
        password,
      });
      const { access_token, user } = response.data;
      localStorage.setItem('token', access_token);
      localStorage.setItem('user', JSON.stringify(user));
      set({ user, token: access_token, isLoading: false });
      return { success: true };
    } catch (error) {
      set({
        error: error.response?.data?.detail || '登录失败',
        isLoading: false,
      });
      return { success: false, error: error.response?.data?.detail || '登录失败' };
    }
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    set({ user: null, token: null });
  },

  isAuthenticated: () => !!get().token,
}));

export default useAuthStore;
