import React, { useState, useRef } from 'react';
import { useResumeStore } from './store/resumeStore';
import { PersonalInfoForm } from './components/forms/PersonalInfoForm';
import { ExperienceForm } from './components/forms/ExperienceForm';
import { EducationForm } from './components/forms/EducationForm';
import { SkillsForm } from './components/forms/SkillsForm';
import { ProjectsForm } from './components/forms/ProjectsForm';
import { ThemeSelector } from './components/ThemeSelector';
import { ResumePreview } from './components/ResumePreview';
import { resumeApi } from './services/api';
import { exportToPdf } from './utils/exportPdf';
import { templates } from './components/templates';
import {
  User,
  Briefcase,
  GraduationCap,
  Code,
  FolderKanban,
  Palette,
  Download,
  Save,
  FileText,
  RotateCcw,
  Menu,
  X,
  Loader2,
} from 'lucide-react';

type TabType = 'personal' | 'experience' | 'education' | 'skills' | 'projects' | 'theme';

const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
  { id: 'personal', label: '个人信息', icon: <User size={18} /> },
  { id: 'experience', label: '工作经验', icon: <Briefcase size={18} /> },
  { id: 'education', label: '教育背景', icon: <GraduationCap size={18} /> },
  { id: 'skills', label: '专业技能', icon: <Code size={18} /> },
  { id: 'projects', label: '项目经验', icon: <FolderKanban size={18} /> },
  { id: 'theme', label: '主题设置', icon: <Palette size={18} /> },
];

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('personal');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const { resume, resetResume } = useResumeStore();
  const pdfExportRef = useRef<HTMLDivElement>(null);

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage('');
    try {
      if (resume.id) {
        await resumeApi.update(resume.id, resume);
        setSaveMessage('简历已更新！');
      } else {
        const saved = await resumeApi.create(resume);
        useResumeStore.setState((state) => ({
          resume: { ...state.resume, id: saved.id },
        }));
        setSaveMessage('简历已保存！');
      }
    } catch (error) {
      console.error('Save error:', error);
      setSaveMessage('保存失败，请检查后端服务是否启动。');
    }
    setSaving(false);
    setTimeout(() => setSaveMessage(''), 3000);
  };

  const handleExportPdf = async () => {
    if (!pdfExportRef.current || exporting) return;

    setExporting(true);
    try {
      const Template = templates[resume.template] || templates.modern;
      const fileName = `${resume.personalInfo.name || '简历'}.pdf`;
      await exportToPdf(pdfExportRef.current, fileName);
    } catch (error) {
      console.error('Export error:', error);
      setSaveMessage('导出失败，请重试。');
      setTimeout(() => setSaveMessage(''), 3000);
    }
    setExporting(false);
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'personal':
        return <PersonalInfoForm />;
      case 'experience':
        return <ExperienceForm />;
      case 'education':
        return <EducationForm />;
      case 'skills':
        return <SkillsForm />;
      case 'projects':
        return <ProjectsForm />;
      case 'theme':
        return <ThemeSelector />;
      default:
        return null;
    }
  };

  const Template = templates[resume.template] || templates.modern;

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <div
        ref={pdfExportRef}
        style={{
          position: 'absolute',
          left: '-9999px',
          top: 0,
          zIndex: -1,
          background: 'white',
        }}
      >
        <Template data={resume} />
      </div>

      <header className="bg-white shadow-sm border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-2 hover:bg-gray-100 rounded-lg"
            >
              {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <div className="flex items-center gap-2">
              <FileText className="text-blue-500" size={28} />
              <h1 className="text-xl font-bold text-gray-800">在线简历构建工具</h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {saveMessage && (
              <span className={`text-sm ${saveMessage.includes('失败') ? 'text-red-500' : 'text-green-500'}`}>
                {saveMessage}
              </span>
            )}
            <button
              onClick={resetResume}
              className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <RotateCcw size={18} />
              <span className="hidden sm:inline">重置</span>
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
            >
              <Save size={18} />
              <span className="hidden sm:inline">{saving ? '保存中...' : '保存'}</span>
            </button>
            <button
              onClick={handleExportPdf}
              disabled={exporting}
              className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors disabled:opacity-50"
            >
              {exporting ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Download size={18} />
              )}
              <span className="hidden sm:inline">{exporting ? '导出中...' : '导出PDF'}</span>
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <aside
          className={`${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          } lg:translate-x-0 fixed lg:static inset-y-0 left-0 z-30 w-80 bg-white shadow-lg lg:shadow-none transition-transform duration-300 mt-[73px] lg:mt-0`}
        >
          <div className="h-full flex flex-col">
            <nav className="flex border-b border-gray-200 overflow-x-auto">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 flex flex-col items-center gap-1 px-2 py-3 text-xs font-medium transition-colors whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'text-blue-500 border-b-2 border-blue-500 bg-blue-50'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                </button>
              ))}
            </nav>

            <div className="flex-1 overflow-y-auto p-4">{renderTabContent()}</div>
          </div>
        </aside>

        {sidebarOpen && (
          <div
            className="lg:hidden fixed inset-0 bg-black/50 z-20 mt-[73px]"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <main className="flex-1 overflow-y-auto bg-gray-200">
          <ResumePreview />
        </main>
      </div>
    </div>
  );
}

export default App;
