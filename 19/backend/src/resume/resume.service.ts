import { Injectable, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { StorageService } from './storage.service';
import { CreateResumeDto, UpdateResumeDto } from './dto/create-resume.dto';
import { Resume } from './resume.entity';

const ensureIds = <T extends { id?: string }>(items: T[]): (T & { id: string })[] =>
  items.map((item) => ({ ...item, id: item.id || uuidv4() }));

@Injectable()
export class ResumeService {
  constructor(private storageService: StorageService) {}

  async findAll(): Promise<Resume[]> {
    return this.storageService.findAll();
  }

  async findOne(id: string): Promise<Resume> {
    const resume = await this.storageService.findOne(id);
    if (!resume) {
      throw new NotFoundException(`Resume with ID ${id} not found`);
    }
    return resume;
  }

  async create(createResumeDto: CreateResumeDto): Promise<Resume> {
    const now = new Date();
    const resume: Resume = {
      id: uuidv4(),
      ...createResumeDto,
      experience: ensureIds(createResumeDto.experience),
      education: ensureIds(createResumeDto.education),
      skills: ensureIds(createResumeDto.skills),
      projects: ensureIds(createResumeDto.projects || []),
      template: createResumeDto.template || 'modern',
      primaryColor: createResumeDto.primaryColor || '#3b82f6',
      createdAt: now,
      updatedAt: now,
    };
    return this.storageService.create(resume);
  }

  async update(id: string, updateResumeDto: UpdateResumeDto): Promise<Resume> {
    const existing = await this.findOne(id);
    const updated: Resume = {
      ...existing,
      ...updateResumeDto,
      experience: ensureIds(updateResumeDto.experience),
      education: ensureIds(updateResumeDto.education),
      skills: ensureIds(updateResumeDto.skills),
      projects: ensureIds(updateResumeDto.projects || []),
      updatedAt: new Date(),
    };
    const result = await this.storageService.update(id, updated);
    if (!result) {
      throw new NotFoundException(`Resume with ID ${id} not found`);
    }
    return result;
  }

  async remove(id: string): Promise<void> {
    const success = await this.storageService.remove(id);
    if (!success) {
      throw new NotFoundException(`Resume with ID ${id} not found`);
    }
  }
}
