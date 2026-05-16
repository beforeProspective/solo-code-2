import { IsString, IsObject, IsArray, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateResumeDto {
  @IsString()
  title: string;

  @IsObject()
  personalInfo: {
    name: string;
    title: string;
    email: string;
    phone: string;
    location: string;
    summary: string;
    linkedin?: string;
    github?: string;
    website?: string;
  };

  @IsArray()
  experience: Array<{
    id?: string;
    company: string;
    position: string;
    startDate: string;
    endDate: string;
    description: string;
  }>;

  @IsArray()
  education: Array<{
    id?: string;
    school: string;
    degree: string;
    field: string;
    startDate: string;
    endDate: string;
  }>;

  @IsArray()
  skills: Array<{
    id?: string;
    name: string;
    level: string;
  }>;

  @IsOptional()
  @IsArray()
  projects?: Array<{
    id?: string;
    name: string;
    description: string;
    technologies: string;
    link?: string;
  }>;

  @IsOptional()
  @IsString()
  template?: string;

  @IsOptional()
  @IsString()
  primaryColor?: string;
}

export class UpdateResumeDto extends CreateResumeDto {}
