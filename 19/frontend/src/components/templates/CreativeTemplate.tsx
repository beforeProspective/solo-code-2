import React from 'react';
import { ResumeData } from '../../types';
import { Mail, Phone, MapPin, Linkedin, Github, Globe } from 'lucide-react';

interface Props {
  data: ResumeData;
}

export const CreativeTemplate: React.FC<Props> = ({ data }) => {
  const { personalInfo, experience, education, skills, projects, primaryColor } = data;

  return (
    <div className="bg-white min-h-[297mm] w-[210mm] shadow-lg font-sans flex">
      <aside className="w-2/5 p-6 text-white" style={{ backgroundColor: primaryColor }}>
        <div className="mb-8">
          <div className="w-24 h-24 rounded-full bg-white/20 flex items-center justify-center mb-4 mx-auto">
            <span className="text-4xl font-bold">{personalInfo.name.charAt(0)}</span>
          </div>
          <h1 className="text-2xl font-bold text-center mb-1">{personalInfo.name}</h1>
          <p className="text-center text-white/80">{personalInfo.title}</p>
        </div>

        <div className="mb-6">
          <h3 className="text-sm font-bold uppercase tracking-wider mb-3 text-white/90">联系方式</h3>
          <div className="space-y-2 text-sm">
            {personalInfo.email && (
              <div className="flex items-center gap-2">
                <Mail size={14} />
                <span className="text-xs">{personalInfo.email}</span>
              </div>
            )}
            {personalInfo.phone && (
              <div className="flex items-center gap-2">
                <Phone size={14} />
                <span className="text-xs">{personalInfo.phone}</span>
              </div>
            )}
            {personalInfo.location && (
              <div className="flex items-center gap-2">
                <MapPin size={14} />
                <span className="text-xs">{personalInfo.location}</span>
              </div>
            )}
          </div>
        </div>

        {skills.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-bold uppercase tracking-wider mb-3 text-white/90">专业技能</h3>
            <div className="space-y-2">
              {skills.map((skill) => (
                <div key={skill.id}>
                  <div className="flex justify-between text-xs mb-1">
                    <span>{skill.name}</span>
                    <span className="text-white/70">{skill.level}</span>
                  </div>
                  <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-white rounded-full"
                      style={{
                        width: skill.level === '精通' ? '95%' : skill.level === '熟练' ? '75%' : '50%',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider mb-3 text-white/90">社交链接</h3>
          <div className="space-y-2 text-sm">
            {personalInfo.linkedin && (
              <div className="flex items-center gap-2">
                <Linkedin size={14} />
                <span className="text-xs">{personalInfo.linkedin}</span>
              </div>
            )}
            {personalInfo.github && (
              <div className="flex items-center gap-2">
                <Github size={14} />
                <span className="text-xs">{personalInfo.github}</span>
              </div>
            )}
            {personalInfo.website && (
              <div className="flex items-center gap-2">
                <Globe size={14} />
                <span className="text-xs">{personalInfo.website}</span>
              </div>
            )}
          </div>
        </div>
      </aside>

      <main className="w-3/5 p-6">
        {personalInfo.summary && (
          <section className="mb-6">
            <h2 className="text-lg font-bold mb-2" style={{ color: primaryColor }}>
              关于我
            </h2>
            <p className="text-gray-700 text-sm leading-relaxed">{personalInfo.summary}</p>
          </section>
        )}

        {experience.length > 0 && (
          <section className="mb-6">
            <h2 className="text-lg font-bold mb-3" style={{ color: primaryColor }}>
              工作经验
            </h2>
            <div className="space-y-4">
              {experience.map((exp) => (
                <div key={exp.id}>
                  <h3 className="font-bold text-gray-800">{exp.position}</h3>
                  <p className="text-sm text-gray-500 mb-1">
                    {exp.company} | {exp.startDate} - {exp.endDate}
                  </p>
                  <p className="text-gray-600 text-sm leading-relaxed">{exp.description}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {projects.length > 0 && (
          <section className="mb-6">
            <h2 className="text-lg font-bold mb-3" style={{ color: primaryColor }}>
              项目经验
            </h2>
            <div className="space-y-3">
              {projects.map((project) => (
                <div key={project.id}>
                  <h3 className="font-semibold text-gray-800 text-sm">{project.name}</h3>
                  <p className="text-gray-600 text-xs leading-relaxed mb-1">{project.description}</p>
                  <p className="text-xs" style={{ color: primaryColor }}>
                    {project.technologies}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {education.length > 0 && (
          <section>
            <h2 className="text-lg font-bold mb-3" style={{ color: primaryColor }}>
              教育背景
            </h2>
            <div className="space-y-3">
              {education.map((edu) => (
                <div key={edu.id}>
                  <h3 className="font-bold text-gray-800">{edu.school}</h3>
                  <p className="text-sm text-gray-600">
                    {edu.degree} · {edu.field}
                  </p>
                  <p className="text-xs text-gray-500">
                    {edu.startDate} - {edu.endDate}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
};
