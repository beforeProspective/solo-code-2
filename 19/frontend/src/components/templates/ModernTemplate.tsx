import React from 'react';
import { ResumeData } from '../../types';
import { Mail, Phone, MapPin, Linkedin, Github, Globe } from 'lucide-react';

interface Props {
  data: ResumeData;
}

export const ModernTemplate: React.FC<Props> = ({ data }) => {
  const { personalInfo, experience, education, skills, projects, primaryColor } = data;

  return (
    <div className="bg-white min-h-[297mm] w-[210mm] shadow-lg p-8 font-sans">
      <header className="mb-6 pb-6 border-b-4" style={{ borderColor: primaryColor }}>
        <h1 className="text-4xl font-bold text-gray-800 mb-2">{personalInfo.name}</h1>
        <p className="text-xl font-medium mb-4" style={{ color: primaryColor }}>
          {personalInfo.title}
        </p>
        <div className="flex flex-wrap gap-4 text-sm text-gray-600">
          {personalInfo.email && (
            <span className="flex items-center gap-1">
              <Mail size={14} /> {personalInfo.email}
            </span>
          )}
          {personalInfo.phone && (
            <span className="flex items-center gap-1">
              <Phone size={14} /> {personalInfo.phone}
            </span>
          )}
          {personalInfo.location && (
            <span className="flex items-center gap-1">
              <MapPin size={14} /> {personalInfo.location}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-4 text-sm mt-2">
          {personalInfo.linkedin && (
            <span className="flex items-center gap-1 text-gray-500">
              <Linkedin size={14} /> {personalInfo.linkedin}
            </span>
          )}
          {personalInfo.github && (
            <span className="flex items-center gap-1 text-gray-500">
              <Github size={14} /> {personalInfo.github}
            </span>
          )}
          {personalInfo.website && (
            <span className="flex items-center gap-1 text-gray-500">
              <Globe size={14} /> {personalInfo.website}
            </span>
          )}
        </div>
      </header>

      {personalInfo.summary && (
        <section className="mb-6">
          <h2 className="text-lg font-bold uppercase tracking-wide mb-3" style={{ color: primaryColor }}>
            个人简介
          </h2>
          <p className="text-gray-700 text-sm leading-relaxed">{personalInfo.summary}</p>
        </section>
      )}

      {experience.length > 0 && (
        <section className="mb-6">
          <h2 className="text-lg font-bold uppercase tracking-wide mb-3" style={{ color: primaryColor }}>
            工作经验
          </h2>
          <div className="space-y-4">
            {experience.map((exp) => (
              <div key={exp.id}>
                <div className="flex justify-between items-start mb-1">
                  <div>
                    <h3 className="font-semibold text-gray-800">{exp.position}</h3>
                    <p className="text-gray-600 text-sm">{exp.company}</p>
                  </div>
                  <span className="text-sm text-gray-500">
                    {exp.startDate} - {exp.endDate}
                  </span>
                </div>
                <p className="text-gray-700 text-sm leading-relaxed">{exp.description}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {projects.length > 0 && (
        <section className="mb-6">
          <h2 className="text-lg font-bold uppercase tracking-wide mb-3" style={{ color: primaryColor }}>
            项目经验
          </h2>
          <div className="space-y-4">
            {projects.map((project) => (
              <div key={project.id}>
                <div className="flex justify-between items-start mb-1">
                  <h3 className="font-semibold text-gray-800">{project.name}</h3>
                  {project.link && <span className="text-xs text-blue-500">{project.link}</span>}
                </div>
                <p className="text-gray-700 text-sm leading-relaxed mb-1">{project.description}</p>
                <p className="text-xs text-gray-500">技术栈: {project.technologies}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {education.length > 0 && (
        <section className="mb-6">
          <h2 className="text-lg font-bold uppercase tracking-wide mb-3" style={{ color: primaryColor }}>
            教育背景
          </h2>
          <div className="space-y-3">
            {education.map((edu) => (
              <div key={edu.id} className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-gray-800">{edu.school}</h3>
                  <p className="text-gray-600 text-sm">
                    {edu.degree} · {edu.field}
                  </p>
                </div>
                <span className="text-sm text-gray-500">
                  {edu.startDate} - {edu.endDate}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {skills.length > 0 && (
        <section>
          <h2 className="text-lg font-bold uppercase tracking-wide mb-3" style={{ color: primaryColor }}>
            专业技能
          </h2>
          <div className="flex flex-wrap gap-2">
            {skills.map((skill) => (
              <span
                key={skill.id}
                className="px-3 py-1 text-sm rounded-full text-white"
                style={{ backgroundColor: primaryColor }}
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
