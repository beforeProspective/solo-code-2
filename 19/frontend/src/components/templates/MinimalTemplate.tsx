import React from 'react';
import { ResumeData } from '../../types';

interface Props {
  data: ResumeData;
}

export const MinimalTemplate: React.FC<Props> = ({ data }) => {
  const { personalInfo, experience, education, skills, projects, primaryColor } = data;

  return (
    <div className="bg-white min-h-[297mm] w-[210mm] shadow-lg p-10 font-sans">
      <header className="mb-10">
        <h1 className="text-5xl font-extralight text-gray-800 mb-2 tracking-tight">
          {personalInfo.name}
        </h1>
        <p className="text-lg font-light text-gray-500 mb-6">{personalInfo.title}</p>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-500">
          {personalInfo.email && <span>{personalInfo.email}</span>}
          {personalInfo.phone && <span>{personalInfo.phone}</span>}
          {personalInfo.location && <span>{personalInfo.location}</span>}
          {personalInfo.linkedin && <span>{personalInfo.linkedin}</span>}
          {personalInfo.github && <span>{personalInfo.github}</span>}
          {personalInfo.website && <span>{personalInfo.website}</span>}
        </div>
      </header>

      {personalInfo.summary && (
        <section className="mb-8">
          <p className="text-gray-700 leading-relaxed border-l-4 pl-4" style={{ borderColor: primaryColor }}>
            {personalInfo.summary}
          </p>
        </section>
      )}

      {experience.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: primaryColor }}>
            工作经验
          </h2>
          <div className="space-y-6">
            {experience.map((exp) => (
              <div key={exp.id}>
                <div className="flex justify-between items-baseline mb-1">
                  <h3 className="font-medium text-gray-800">{exp.position}</h3>
                  <span className="text-xs text-gray-400">
                    {exp.startDate} — {exp.endDate}
                  </span>
                </div>
                <p className="text-sm text-gray-500 mb-2">{exp.company}</p>
                <p className="text-sm text-gray-600 leading-relaxed">{exp.description}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {projects.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: primaryColor }}>
            项目经验
          </h2>
          <div className="space-y-5">
            {projects.map((project) => (
              <div key={project.id}>
                <div className="flex justify-between items-baseline mb-1">
                  <h3 className="font-medium text-gray-800">{project.name}</h3>
                  {project.link && <span className="text-xs text-gray-400">{project.link}</span>}
                </div>
                <p className="text-sm text-gray-600 leading-relaxed mb-1">{project.description}</p>
                <p className="text-xs text-gray-400">{project.technologies}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {education.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: primaryColor }}>
            教育背景
          </h2>
          <div className="space-y-4">
            {education.map((edu) => (
              <div key={edu.id} className="flex justify-between items-baseline">
                <div>
                  <h3 className="font-medium text-gray-800">{edu.school}</h3>
                  <p className="text-sm text-gray-500">
                    {edu.degree}, {edu.field}
                  </p>
                </div>
                <span className="text-xs text-gray-400">
                  {edu.startDate} — {edu.endDate}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {skills.length > 0 && (
        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: primaryColor }}>
            专业技能
          </h2>
          <div className="flex flex-wrap gap-3">
            {skills.map((skill) => (
              <span
                key={skill.id}
                className="text-sm text-gray-600 border-b-2 pb-0.5"
                style={{ borderColor: primaryColor }}
              >
                {skill.name}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
