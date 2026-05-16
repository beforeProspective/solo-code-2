import React from 'react';
import { useResumeStore } from '../../store/resumeStore';
import { Code, Plus, Trash2 } from 'lucide-react';

export const SkillsForm: React.FC = () => {
  const { resume, addSkill, updateSkill, removeSkill } = useResumeStore();
  const { skills } = resume;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
          <Code size={20} />
          专业技能
        </h3>
        <button
          onClick={addSkill}
          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
        >
          <Plus size={16} />
          添加
        </button>
      </div>

      <div className="space-y-3">
        {skills.map((skill, index) => (
          <div key={skill.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <span className="text-sm font-medium text-gray-500 w-8">#{index + 1}</span>
            <input
              type="text"
              value={skill.name}
              onChange={(e) => updateSkill(skill.id, { name: e.target.value })}
              placeholder="技能名称"
              className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <select
              value={skill.level}
              onChange={(e) => updateSkill(skill.id, { level: e.target.value })}
              className="w-24 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="精通">精通</option>
              <option value="熟练">熟练</option>
              <option value="了解">了解</option>
            </select>
            <button
              onClick={() => removeSkill(skill.id)}
              className="text-red-500 hover:text-red-700 p-1"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
