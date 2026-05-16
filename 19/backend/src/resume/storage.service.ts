import { Injectable, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { Resume } from './resume.entity';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly dataDir = path.join(process.cwd(), 'data');
  private readonly dataFile = path.join(this.dataDir, 'resumes.json');

  onModuleInit() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    if (!fs.existsSync(this.dataFile)) {
      fs.writeFileSync(this.dataFile, JSON.stringify([]));
    }
  }

  async readAll(): Promise<Resume[]> {
    try {
      const data = fs.readFileSync(this.dataFile, 'utf-8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  async writeAll(resumes: Resume[]): Promise<void> {
    fs.writeFileSync(this.dataFile, JSON.stringify(resumes, null, 2));
  }

  async findAll(): Promise<Resume[]> {
    const resumes = await this.readAll();
    return resumes.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  async findOne(id: string): Promise<Resume | undefined> {
    const resumes = await this.readAll();
    return resumes.find((r) => r.id === id);
  }

  async create(resume: Resume): Promise<Resume> {
    const resumes = await this.readAll();
    resumes.push(resume);
    await this.writeAll(resumes);
    return resume;
  }

  async update(id: string, resume: Resume): Promise<Resume | undefined> {
    const resumes = await this.readAll();
    const index = resumes.findIndex((r) => r.id === id);
    if (index !== -1) {
      resumes[index] = resume;
      await this.writeAll(resumes);
      return resume;
    }
    return undefined;
  }

  async remove(id: string): Promise<boolean> {
    const resumes = await this.readAll();
    const filtered = resumes.filter((r) => r.id !== id);
    if (filtered.length !== resumes.length) {
      await this.writeAll(filtered);
      return true;
    }
    return false;
  }
}
