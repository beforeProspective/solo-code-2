export interface PersonalInfo {
  name: string;
  title: string;
  email: string;
  phone: string;
  location: string;
  summary: string;
  linkedin?: string;
  github?: string;
  website?: string;
}

export interface Experience {
  id: string;
  company: string;
  position: string;
  startDate: string;
  endDate: string;
  description: string;
}

export interface Education {
  id: string;
  school: string;
  degree: string;
  field: string;
  startDate: string;
  endDate: string;
}

export interface Skill {
  id: string;
  name: string;
  level: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  technologies: string;
  link?: string;
}

export interface ResumeData {
  id?: string;
  title: string;
  personalInfo: PersonalInfo;
  experience: Experience[];
  education: Education[];
  skills: Skill[];
  projects: Project[];
  template: string;
  primaryColor: string;
}

export interface ResumeStore {
  resume: ResumeData;
  setPersonalInfo: (info: Partial<PersonalInfo>) => void;
  addExperience: () => void;
  updateExperience: (id: string, exp: Partial<Experience>) => void;
  removeExperience: (id: string) => void;
  addEducation: () => void;
  updateEducation: (id: string, edu: Partial<Education>) => void;
  removeEducation: (id: string) => void;
  addSkill: () => void;
  updateSkill: (id: string, skill: Partial<Skill>) => void;
  removeSkill: (id: string) => void;
  addProject: () => void;
  updateProject: (id: string, project: Partial<Project>) => void;
  removeProject: (id: string) => void;
  setTemplate: (template: string) => void;
  setPrimaryColor: (color: string) => void;
  setTitle: (title: string) => void;
  loadResume: (resume: ResumeData) => void;
  resetResume: () => void;
}

export const generateId = (): string =>
  Math.random().toString(36).substring(2, 9);

export const defaultResume: ResumeData = {
  title: '我的简历',
  personalInfo: {
    name: '张三',
    title: '高级前端工程师',
    email: 'zhangsan@example.com',
    phone: '138-0000-0000',
    location: '北京市',
    summary: '拥有5年以上前端开发经验，精通React、Vue等现代前端框架，对用户体验和性能优化有深入研究。',
    linkedin: 'linkedin.com/in/zhangsan',
    github: 'github.com/zhangsan',
    website: 'zhangsan.dev',
  },
  experience: [
    {
      id: generateId(),
      company: '某科技有限公司',
      position: '高级前端工程师',
      startDate: '2021-01',
      endDate: '至今',
      description: '负责公司核心产品的前端架构设计与开发，带领5人团队完成多个重要项目，性能优化提升40%。',
    },
    {
      id: generateId(),
      company: '某互联网公司',
      position: '前端开发工程师',
      startDate: '2018-06',
      endDate: '2020-12',
      description: '参与电商平台前端开发，独立完成购物车、订单系统等核心模块，日活用户超100万。',
    },
  ],
  education: [
    {
      id: generateId(),
      school: '北京大学',
      degree: '硕士',
      field: '计算机科学与技术',
      startDate: '2016-09',
      endDate: '2018-06',
    },
    {
      id: generateId(),
      school: '清华大学',
      degree: '学士',
      field: '软件工程',
      startDate: '2012-09',
      endDate: '2016-06',
    },
  ],
  skills: [
    { id: generateId(), name: 'React', level: '精通' },
    { id: generateId(), name: 'TypeScript', level: '精通' },
    { id: generateId(), name: 'Vue.js', level: '熟练' },
    { id: generateId(), name: 'Node.js', level: '熟练' },
    { id: generateId(), name: 'Webpack', level: '熟练' },
  ],
  projects: [
    {
      id: generateId(),
      name: '企业级管理后台',
      description: '基于React+TypeScript构建的企业级管理系统，支持权限管理、数据可视化等功能。',
      technologies: 'React, TypeScript, Ant Design, ECharts',
      link: 'github.com/zhangsan/admin-dashboard',
    },
  ],
  template: 'modern',
  primaryColor: '#3b82f6',
};
