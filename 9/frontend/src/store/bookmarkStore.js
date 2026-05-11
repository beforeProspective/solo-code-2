import { create } from 'zustand';
import api from '../lib/api';

const useBookmarkStore = create((set, get) => ({
  bookmarks: [],
  categories: [],
  tags: [],
  publicLists: [],
  isLoading: false,
  error: null,

  fetchBookmarks: async (filters = {}) => {
    set({ isLoading: true });
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params.append(key, value);
        }
      });
      const response = await api.get(`/bookmarks?${params.toString()}`);
      set({ bookmarks: response.data, isLoading: false });
    } catch (error) {
      set({ error: '获取书签失败', isLoading: false });
    }
  },

  addBookmark: async (bookmarkData) => {
    set({ isLoading: true });
    try {
      const response = await api.post('/bookmarks', bookmarkData);
      set((state) => ({
        bookmarks: [response.data, ...state.bookmarks],
        isLoading: false,
      }));
      return { success: true };
    } catch (error) {
      set({ error: '添加书签失败', isLoading: false });
      return { success: false };
    }
  },

  updateBookmark: async (id, data) => {
    try {
      const response = await api.put(`/bookmarks/${id}`, data);
      set((state) => ({
        bookmarks: state.bookmarks.map((b) =>
          b.id === id ? response.data : b
        ),
      }));
      return { success: true };
    } catch (error) {
      set({ error: '更新书签失败' });
      return { success: false };
    }
  },

  deleteBookmark: async (id) => {
    try {
      await api.delete(`/bookmarks/${id}`);
      set((state) => ({
        bookmarks: state.bookmarks.filter((b) => b.id !== id),
      }));
      return { success: true };
    } catch (error) {
      set({ error: '删除书签失败' });
      return { success: false };
    }
  },

  toggleFavorite: async (id) => {
    try {
      const response = await api.post(`/bookmarks/${id}/favorite`);
      set((state) => ({
        bookmarks: state.bookmarks.map((b) =>
          b.id === id ? response.data : b
        ),
      }));
      return { success: true };
    } catch (error) {
      set({ error: '操作失败' });
      return { success: false };
    }
  },

  toggleArchive: async (id) => {
    try {
      const response = await api.post(`/bookmarks/${id}/archive`);
      set((state) => ({
        bookmarks: state.bookmarks.map((b) =>
          b.id === id ? response.data : b
        ),
      }));
      return { success: true };
    } catch (error) {
      set({ error: '操作失败' });
      return { success: false };
    }
  },

  fetchCategories: async () => {
    try {
      const response = await api.get('/categories');
      set({ categories: response.data });
    } catch (error) {
      set({ error: '获取分类失败' });
    }
  },

  addCategory: async (name, color = '#3B82F6') => {
    try {
      const response = await api.post('/categories', { name, color });
      set((state) => ({
        categories: [...state.categories, response.data],
      }));
      return { success: true, data: response.data };
    } catch (error) {
      set({ error: '添加分类失败' });
      return { success: false };
    }
  },

  deleteCategory: async (id) => {
    try {
      await api.delete(`/categories/${id}`);
      set((state) => ({
        categories: state.categories.filter((c) => c.id !== id),
      }));
      return { success: true };
    } catch (error) {
      set({ error: '删除分类失败' });
      return { success: false };
    }
  },

  fetchTags: async () => {
    try {
      const response = await api.get('/tags');
      set({ tags: response.data });
    } catch (error) {
      set({ error: '获取标签失败' });
    }
  },

  fetchPublicLists: async () => {
    try {
      const response = await api.get('/public-lists');
      set({ publicLists: response.data });
    } catch (error) {
      set({ error: '获取公开列表失败' });
    }
  },

  createPublicList: async (data) => {
    try {
      const response = await api.post('/public-lists', data);
      set((state) => ({
        publicLists: [response.data, ...state.publicLists],
      }));
      return { success: true, data: response.data };
    } catch (error) {
      set({ error: '创建公开列表失败' });
      return { success: false };
    }
  },

  deletePublicList: async (id) => {
    try {
      await api.delete(`/public-lists/${id}`);
      set((state) => ({
        publicLists: state.publicLists.filter((l) => l.id !== id),
      }));
      return { success: true };
    } catch (error) {
      set({ error: '删除公开列表失败' });
      return { success: false };
    }
  },

  importBookmarks: async (file) => {
    set({ isLoading: true });
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await api.post('/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      set({ isLoading: false });
      return { success: true, data: response.data };
    } catch (error) {
      set({ error: '导入失败', isLoading: false });
      return { success: false };
    }
  },

  exportBookmarks: async () => {
    try {
      const response = await api.get('/export', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `bookmarks_${new Date().toISOString().split('T')[0]}.html`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return { success: true };
    } catch (error) {
      set({ error: '导出失败' });
      return { success: false };
    }
  },
}));

export default useBookmarkStore;
