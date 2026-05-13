import { create } from 'zustand';
import {
  authApi,
  accountApi,
  transactionApi,
  categoryApi,
  tagApi,
  budgetApi,
  billApi,
  ruleApi,
  reportApi,
} from '../services/api';

const useStore = create((set, get) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  authInitialized: false,
  accounts: [],
  transactions: [],
  categories: [],
  tags: [],
  budgets: [],
  bills: [],
  rules: [],
  summary: null,
  loading: false,
  error: null,

  login: async (credentials) => {
    set({ loading: true, error: null });
    try {
      const response = await authApi.login(credentials);
      const { token, user } = response.data;
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      set({
        user,
        token,
        isAuthenticated: true,
        loading: false,
      });
      return { success: true };
    } catch (error) {
      set({
        error: error.response?.data?.message || '登录失败',
        loading: false,
      });
      return { success: false, error: error.response?.data };
    }
  },

  register: async (data) => {
    set({ loading: true, error: null });
    try {
      const response = await authApi.register(data);
      const { token, user } = response.data;
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      set({
        user,
        token,
        isAuthenticated: true,
        loading: false,
      });
      return { success: true };
    } catch (error) {
      set({
        error: error.response?.data?.message || '注册失败',
        loading: false,
      });
      return { success: false, error: error.response?.data };
    }
  },

  logout: async () => {
    try {
      await authApi.logout();
    } catch (error) {
      console.error('Logout error:', error);
    }
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    set({
      user: null,
      token: null,
      isAuthenticated: false,
      accounts: [],
      transactions: [],
      categories: [],
      tags: [],
      budgets: [],
      bills: [],
      rules: [],
    });
  },

  initAuth: () => {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    if (token && user) {
      set({ user, token, isAuthenticated: true, authInitialized: true });
    } else {
      set({ authInitialized: true });
    }
  },

  fetchAll: async () => {
    set({ loading: true });
    await Promise.all([
      get().fetchAccounts(),
      get().fetchCategories(),
      get().fetchTags(),
      get().fetchBudgets(),
      get().fetchBills(),
      get().fetchRules(),
      get().fetchSummary(),
    ]);
    set({ loading: false });
  },

  fetchAccounts: async () => {
    try {
      const response = await accountApi.getAll();
      set({ accounts: response.data });
    } catch (error) {
      console.error('Error fetching accounts:', error);
    }
  },

  addAccount: async (data) => {
    try {
      const response = await accountApi.create(data);
      set((state) => ({ accounts: [response.data, ...state.accounts] }));
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  updateAccount: async (id, data) => {
    try {
      const response = await accountApi.update(id, data);
      set((state) => ({
        accounts: state.accounts.map((a) => (a.id === id ? response.data : a)),
      }));
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  deleteAccount: async (id) => {
    try {
      await accountApi.delete(id);
      set((state) => ({
        accounts: state.accounts.filter((a) => a.id !== id),
      }));
    } catch (error) {
      throw error;
    }
  },

  fetchTransactions: async (params = {}) => {
    try {
      const response = await transactionApi.getAll(params);
      set({
        transactions: response.data.data || response.data,
        transactionPagination: response.data.meta || null,
      });
    } catch (error) {
      console.error('Error fetching transactions:', error);
    }
  },

  addTransaction: async (data) => {
    try {
      const response = await transactionApi.create(data);
      set((state) => ({
        transactions: [response.data, ...state.transactions],
      }));
      await get().fetchAccounts();
      await get().fetchSummary();
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  updateTransaction: async (id, data) => {
    try {
      const response = await transactionApi.update(id, data);
      set((state) => ({
        transactions: state.transactions.map((t) => (t.id === id ? response.data : t)),
      }));
      await get().fetchAccounts();
      await get().fetchSummary();
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  deleteTransaction: async (id) => {
    try {
      await transactionApi.delete(id);
      set((state) => ({
        transactions: state.transactions.filter((t) => t.id !== id),
      }));
      await get().fetchAccounts();
      await get().fetchSummary();
    } catch (error) {
      throw error;
    }
  },

  fetchCategories: async () => {
    try {
      const response = await categoryApi.getAll();
      set({ categories: response.data });
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  },

  addCategory: async (data) => {
    try {
      const response = await categoryApi.create(data);
      set((state) => ({ categories: [...state.categories, response.data] }));
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  deleteCategory: async (id) => {
    try {
      await categoryApi.delete(id);
      set((state) => ({
        categories: state.categories.filter((c) => c.id !== id),
      }));
    } catch (error) {
      throw error;
    }
  },

  fetchTags: async () => {
    try {
      const response = await tagApi.getAll();
      set({ tags: response.data });
    } catch (error) {
      console.error('Error fetching tags:', error);
    }
  },

  addTag: async (data) => {
    try {
      const response = await tagApi.create(data);
      set((state) => ({ tags: [...state.tags, response.data] }));
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  updateTag: async (id, data) => {
    try {
      const response = await tagApi.update(id, data);
      set((state) => ({
        tags: state.tags.map((t) => (t.id === id ? response.data : t)),
      }));
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  deleteTag: async (id) => {
    try {
      await tagApi.delete(id);
      set((state) => ({
        tags: state.tags.filter((t) => t.id !== id),
      }));
    } catch (error) {
      throw error;
    }
  },

  fetchBudgets: async () => {
    try {
      const response = await budgetApi.getAll();
      set({ budgets: response.data });
    } catch (error) {
      console.error('Error fetching budgets:', error);
    }
  },

  addBudget: async (data) => {
    try {
      const response = await budgetApi.create(data);
      set((state) => ({ budgets: [response.data, ...state.budgets] }));
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  updateBudget: async (id, data) => {
    try {
      const response = await budgetApi.update(id, data);
      set((state) => ({
        budgets: state.budgets.map((b) => (b.id === id ? response.data : b)),
      }));
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  deleteBudget: async (id) => {
    try {
      await budgetApi.delete(id);
      set((state) => ({
        budgets: state.budgets.filter((b) => b.id !== id),
      }));
    } catch (error) {
      throw error;
    }
  },

  fetchBills: async (params = {}) => {
    try {
      const response = await billApi.getAll(params);
      set({ bills: response.data });
    } catch (error) {
      console.error('Error fetching bills:', error);
    }
  },

  addBill: async (data) => {
    try {
      const response = await billApi.create(data);
      set((state) => ({
        bills: {
          ...state.bills,
          bills: [response.data, ...(state.bills.bills || [])],
        },
      }));
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  updateBill: async (id, data) => {
    try {
      const response = await billApi.update(id, data);
      if (get().bills.bills) {
        set((state) => ({
          bills: {
            ...state.bills,
            bills: state.bills.bills.map((b) => (b.id === id ? response.data : b)),
          },
        }));
      }
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  markBillAsPaid: async (id) => {
    try {
      const response = await billApi.markAsPaid(id);
      await get().fetchBills();
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  deleteBill: async (id) => {
    try {
      await billApi.delete(id);
      if (get().bills.bills) {
        set((state) => ({
          bills: {
            ...state.bills,
            bills: state.bills.bills.filter((b) => b.id !== id),
          },
        }));
      }
    } catch (error) {
      throw error;
    }
  },

  fetchRules: async () => {
    try {
      const response = await ruleApi.getAll();
      set({ rules: response.data });
    } catch (error) {
      console.error('Error fetching rules:', error);
    }
  },

  addRule: async (data) => {
    try {
      const response = await ruleApi.create(data);
      set((state) => ({ rules: [response.data, ...state.rules] }));
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  updateRule: async (id, data) => {
    try {
      const response = await ruleApi.update(id, data);
      set((state) => ({
        rules: state.rules.map((r) => (r.id === id ? response.data : r)),
      }));
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  deleteRule: async (id) => {
    try {
      await ruleApi.delete(id);
      set((state) => ({
        rules: state.rules.filter((r) => r.id !== id),
      }));
    } catch (error) {
      throw error;
    }
  },

  fetchSummary: async () => {
    try {
      const response = await reportApi.summary();
      set({ summary: response.data });
    } catch (error) {
      console.error('Error fetching summary:', error);
    }
  },
}));

export default useStore;
