import React from 'react';
import { useResumeStore } from '../../store/resumeStore';
import { FolderKanban, Plus, Trash2 } from 'lucide-react';

export const ProjectsForm: React.FC = () => {
  const { resume, addProject, updateProject, removeProject } = useResumeStore();
  const { projects } = resume;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
          <FolderKanban size={20} />
          项目经验
        </h3>
        <button
          onClick={addProject}
          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
        >
          <Plus size={16} />
          添加
        </button>
      </div>

      <div className="space-y-4">
        {projects.map((project, index) => (
          <div key={project.id} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-600">项目 #{index + 1}</span>
              <button
                onClick={() => removeProject(project.id)}
                className="text-red-500 hover:text-red-700 p-1"
              >
                <Trash2 size={16} />
              </button>
            </div>

            <div className="mb-3">
              <label className="block text-xs font-medium text-gray-600 mb-1">项目名称</label>
              <input
                type="text"
                value={project.name}
                onChange={(e) => updateProject(project.id, { name: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="mb-3">
              <label className="block text-xs font-medium text-gray-600 mb-1">项目描述</label>
              <textarea
                value={project.description}
                onChange={(e) => updateProject(project.id, { description: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                placeholder="描述项目功能和您的贡献..."
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">技术栈</label>
                <input
                  type="text"
                  value={project.technologies}
                  onChange={(e) => updateProject(project.id, { technologies: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="如：React, TypeScript"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">项目链接</label>
                <input
                  type="text"
                  value={project.link || ''}
                  onChange={(e) => updateProject(project.id, { link: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="可选"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
