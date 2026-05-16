import axios from 'axios';
import { ResumeData } from '../types';

const API_BASE = 'http://localhost:8003/api';

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const resumeApi = {
  getAll: async (): Promise<ResumeData[]> => {
    const response = await api.get('/resumes');
    return response.data;
  },

  getById: async (id: string): Promise<ResumeData> => {
    const response = await api.get(`/resumes/${id}`);
    return response.data;
  },

  create: async (resume: ResumeData): Promise<ResumeData> => {
    const response = await api.post('/resumes', resume);
    return response.data;
  },

  update: async (id: string, resume: ResumeData): Promise<ResumeData> => {
    const response = await api.patch(`/resumes/${id}`, resume);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/resumes/${id}`);
  },
};
