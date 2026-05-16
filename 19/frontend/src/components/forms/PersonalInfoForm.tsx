import React from 'react';
import { useResumeStore } from '../../store/resumeStore';
import { User, Mail, Phone, MapPin, Linkedin, Github, Globe, FileText } from 'lucide-react';

export const PersonalInfoForm: React.FC = () => {
  const { resume, setPersonalInfo } = useResumeStore();
  const { personalInfo } = resume;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
        <User size={20} />
        个人信息
      </h3>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">姓名</label>
          <input
            type="text"
            value={personalInfo.name}
            onChange={(e) => setPersonalInfo({ name: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">职位</label>
          <input
            type="text"
            value={personalInfo.title}
            onChange={(e) => setPersonalInfo({ title: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
            <Mail size={14} /> 邮箱
          </label>
          <input
            type="email"
            value={personalInfo.email}
            onChange={(e) => setPersonalInfo({ email: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
            <Phone size={14} /> 电话
          </label>
          <input
            type="tel"
            value={personalInfo.phone}
            onChange={(e) => setPersonalInfo({ phone: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
          <MapPin size={14} /> 所在地
        </label>
        <input
          type="text"
          value={personalInfo.location}
          onChange={(e) => setPersonalInfo({ location: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
          <FileText size={14} /> 个人简介
        </label>
        <textarea
          value={personalInfo.summary}
          onChange={(e) => setPersonalInfo({ summary: e.target.value })}
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
            <Linkedin size={14} /> LinkedIn
          </label>
          <input
            type="text"
            value={personalInfo.linkedin || ''}
            onChange={(e) => setPersonalInfo({ linkedin: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            placeholder="可选"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
            <Github size={14} /> GitHub
          </label>
          <input
            type="text"
            value={personalInfo.github || ''}
            onChange={(e) => setPersonalInfo({ github: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            placeholder="可选"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
            <Globe size={14} /> 个人网站
          </label>
          <input
            type="text"
            value={personalInfo.website || ''}
            onChange={(e) => setPersonalInfo({ website: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            placeholder="可选"
          />
        </div>
      </div>
    </div>
  );
};
