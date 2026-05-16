import React from 'react';
import { ResumeData } from '../../types';

interface Props {
  data: ResumeData;
}

export const ClassicTemplate: React.FC<Props> = ({ data }) => {
  const { personalInfo, experience, education, skills, projects, primaryColor } = data;

  return (
    <div className="bg-white min-h-[297mm] w-[210mm] shadow-lg p-8 font-serif">
      <header className="text-center mb-8 pb-6 border-b-2" style={{ borderColor: primaryColor }}>
        <h1 className="text-4xl font-bold text-gray-800 mb-2 tracking-wide">{personalInfo.name}</h1>
        <p className="text-lg text-gray-600 mb-4">{personalInfo.title}</p>
        <div className="flex justify-center flex-wrap gap-6 text-sm text-gray-600">
          {personalInfo.email && <span>{personalInfo.email}</span>}
          {personalInfo.phone && <span>{personalInfo.phone}</span>}
          {personalInfo.location && <span>{personalInfo.location}</span>}
        </div>
        <div className="flex justify-center flex-wrap gap-6 text-sm text-gray-500 mt-2">
          {personalInfo.linkedin && <span>{personalInfo.linkedin}</span>}
          {personalInfo.github && <span>{personalInfo.github}</span>}
          {personalInfo.website && <span>{personalInfo.website}</span>}
        </div>
      </header>

      {personalInfo.summary && (
        <section className="mb-6">
          <h2 className="text-base font-bold uppercase tracking-widest mb-2" style={{ color: primaryColor }}>
            个人简介
          </h2>
          <div className="h-px mb-3" style={{ backgroundColor: primaryColor }} />
          <p className="text-gray-700 text-sm leading-relaxed">{personalInfo.summary}</p>
        </section>
      )}

      {experience.length > 0 && (
        <section className="mb-6">
          <h2 className="text-base font-bold uppercase tracking-widest mb-2" style={{ color: primaryColor }}>
            工作经验
          </h2>
          <div className="h-px mb-3" style={{ backgroundColor: primaryColor }} />
          <div className="space-y-4">
            {experience.map((exp) => (
              <div key={exp.id}>
                <div className="flex justify-between items-baseline">
                  <h3 className="font-bold text-gray-800">{exp.company}</h3>
                  <span className="text-sm text-gray-500 italic">
                    {exp.startDate} - {exp.endDate}
                  </span>
                </div>
                <p className="text-gray-700 font-medium mb-1">{exp.position}</p>
                <p className="text-gray-700 text-sm leading-relaxed">{exp.description}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {projects.length > 0 && (
        <section className="mb-6">
          <h2 className="text-base font-bold uppercase tracking-widest mb-2" style={{ color: primaryColor }}>
            项目经验
          </h2>
          <div className="h-px mb-3" style={{ backgroundColor: primaryColor }} />
          <div className="space-y-4">
            {projects.map((project) => (
              <div key={project.id}>
                <div className="flex justify-between items-baseline">
                  <h3 className="font-bold text-gray-800">{project.name}</h3>
                  {project.link && <span className="text-sm text-gray-500 italic">{project.link}</span>}
                </div>
                <p className="text-gray-700 text-sm leading-relaxed mb-1">{project.description}</p>
                <p className="text-xs text-gray-500 italic">技术: {project.technologies}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {education.length > 0 && (
        <section className="mb-6">
          <h2 className="text-base font-bold uppercase tracking-widest mb-2" style={{ color: primaryColor }}>
            教育背景
          </h2>
          <div className="h-px mb-3" style={{ backgroundColor: primaryColor }} />
          <div className="space-y-3">
            {education.map((edu) => (
              <div key={edu.id} className="flex justify-between items-baseline">
                <div>
                  <h3 className="font-bold text-gray-800">{edu.school}</h3>
                  <p className="text-gray-600 text-sm italic">
                    {edu.degree} in {edu.field}
                  </p>
                </div>
                <span className="text-sm text-gray-500 italic">
                  {edu.startDate} - {edu.endDate}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {skills.length > 0 && (
        <section>
          <h2 className="text-base font-bold uppercase tracking-widest mb-2" style={{ color: primaryColor }}>
            专业技能
          </h2>
          <div className="h-px mb-3" style={{ backgroundColor: primaryColor }} />
          <div className="grid grid-cols-3 gap-2">
            {skills.map((skill) => (
              <div key={skill.id} className="text-sm text-gray-700">
                <span className="font-medium">{skill.name}</span>
                <span className="text-gray-500"> - {skill.level}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
