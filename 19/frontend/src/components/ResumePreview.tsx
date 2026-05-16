import React from 'react';
import { useResumeStore } from '../store/resumeStore';
import { templates } from './templates';

export const ResumePreview: React.FC = () => {
  const { resume } = useResumeStore();
  const Template = templates[resume.template] || templates.modern;

  return (
    <div className="w-full flex justify-center overflow-auto p-8">
      <div className="transform origin-top" style={{ transform: 'scale(0.75)' }}>
        <Template data={resume} />
      </div>
    </div>
  );
};
