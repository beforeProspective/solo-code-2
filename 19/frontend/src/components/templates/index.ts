import { ModernTemplate } from './ModernTemplate';
import { ClassicTemplate } from './ClassicTemplate';
import { CreativeTemplate } from './CreativeTemplate';
import { MinimalTemplate } from './MinimalTemplate';
import { ResumeData } from '../../types';

export const templates: Record<string, React.FC<{ data: ResumeData }>> = {
  modern: ModernTemplate,
  classic: ClassicTemplate,
  creative: CreativeTemplate,
  minimal: MinimalTemplate,
};

export const templateNames: Record<string, string> = {
  modern: '现代简约',
  classic: '经典专业',
  creative: '创意设计',
  minimal: '极简风格',
};
