import { create } from 'zustand';
import { ResumeStore, ResumeData, defaultResume, generateId } from '../types';

export const useResumeStore = create<ResumeStore>((set) => ({
  resume: { ...defaultResume },

  setPersonalInfo: (info) =>
    set((state) => ({
      resume: {
        ...state.resume,
        personalInfo: { ...state.resume.personalInfo, ...info },
      },
    })),

  addExperience: () =>
    set((state) => ({
      resume: {
        ...state.resume,
        experience: [
          ...state.resume.experience,
          {
            id: generateId(),
            company: '',
            position: '',
            startDate: '',
            endDate: '',
            description: '',
          },
        ],
      },
    })),

  updateExperience: (id, exp) =>
    set((state) => ({
      resume: {
        ...state.resume,
        experience: state.resume.experience.map((e) =>
          e.id === id ? { ...e, ...exp } : e
        ),
      },
    })),

  removeExperience: (id) =>
    set((state) => ({
      resume: {
        ...state.resume,
        experience: state.resume.experience.filter((e) => e.id !== id),
      },
    })),

  addEducation: () =>
    set((state) => ({
      resume: {
        ...state.resume,
        education: [
          ...state.resume.education,
          {
            id: generateId(),
            school: '',
            degree: '',
            field: '',
            startDate: '',
            endDate: '',
          },
        ],
      },
    })),

  updateEducation: (id, edu) =>
    set((state) => ({
      resume: {
        ...state.resume,
        education: state.resume.education.map((e) =>
          e.id === id ? { ...e, ...edu } : e
        ),
      },
    })),

  removeEducation: (id) =>
    set((state) => ({
      resume: {
        ...state.resume,
        education: state.resume.education.filter((e) => e.id !== id),
      },
    })),

  addSkill: () =>
    set((state) => ({
      resume: {
        ...state.resume,
        skills: [
          ...state.resume.skills,
          { id: generateId(), name: '', level: '熟练' },
        ],
      },
    })),

  updateSkill: (id, skill) =>
    set((state) => ({
      resume: {
        ...state.resume,
        skills: state.resume.skills.map((s) =>
          s.id === id ? { ...s, ...skill } : s
        ),
      },
    })),

  removeSkill: (id) =>
    set((state) => ({
      resume: {
        ...state.resume,
        skills: state.resume.skills.filter((s) => s.id !== id),
      },
    })),

  addProject: () =>
    set((state) => ({
      resume: {
        ...state.resume,
        projects: [
          ...state.resume.projects,
          {
            id: generateId(),
            name: '',
            description: '',
            technologies: '',
            link: '',
          },
        ],
      },
    })),

  updateProject: (id, project) =>
    set((state) => ({
      resume: {
        ...state.resume,
        projects: state.resume.projects.map((p) =>
          p.id === id ? { ...p, ...project } : p
        ),
      },
    })),

  removeProject: (id) =>
    set((state) => ({
      resume: {
        ...state.resume,
        projects: state.resume.projects.filter((p) => p.id !== id),
      },
    })),

  setTemplate: (template) =>
    set((state) => ({
      resume: { ...state.resume, template },
    })),

  setPrimaryColor: (primaryColor) =>
    set((state) => ({
      resume: { ...state.resume, primaryColor },
    })),

  setTitle: (title) =>
    set((state) => ({
      resume: { ...state.resume, title },
    })),

  loadResume: (resume: ResumeData) => set({ resume }),

  resetResume: () => set({ resume: { ...defaultResume } }),
}));
