import React from 'react';
import { useResumeStore } from '../store/resumeStore';
import { Palette, Layout } from 'lucide-react';

const templates = [
  { id: 'modern', name: '现代简约' },
  { id: 'classic', name: '经典专业' },
  { id: 'creative', name: '创意设计' },
  { id: 'minimal', name: '极简风格' },
];

const colorPresets = [
  '#3b82f6',
  '#ef4444',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#64748b',
];

export const ThemeSelector: React.FC = () => {
  const { resume, setTemplate, setPrimaryColor, setTitle } = useResumeStore();

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">简历标题</label>
        <input
          type="text"
          value={resume.title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      <div>
        <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2 mb-3">
          <Layout size={20} />
          选择模板
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {templates.map((template) => (
            <button
              key={template.id}
              onClick={() => setTemplate(template.id)}
              className={`p-4 rounded-lg border-2 transition-all ${
                resume.template === template.id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
            >
              <span className={`text-sm font-medium ${
                resume.template === template.id ? 'text-blue-600' : 'text-gray-700'
              }`}>
                {template.name}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2 mb-3">
          <Palette size={20} />
          主题颜色
        </h3>
        <div className="flex flex-wrap gap-3">
          {colorPresets.map((color) => (
            <button
              key={color}
              onClick={() => setPrimaryColor(color)}
              className={`w-10 h-10 rounded-full border-4 transition-transform hover:scale-110 ${
                resume.primaryColor === color ? 'border-gray-800 scale-110' : 'border-white shadow-md'
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
          <div className="flex items-center gap-2 ml-2">
            <input
              type="color"
              value={resume.primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              className="w-10 h-10 rounded-lg cursor-pointer border-0"
            />
            <span className="text-sm text-gray-500">自定义</span>
          </div>
        </div>
      </div>
    </div>
  );
};
