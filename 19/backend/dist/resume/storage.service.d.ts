import { OnModuleInit } from '@nestjs/common';
import { Resume } from './resume.entity';
export declare class StorageService implements OnModuleInit {
    private readonly dataDir;
    private readonly dataFile;
    onModuleInit(): void;
    readAll(): Promise<Resume[]>;
    writeAll(resumes: Resume[]): Promise<void>;
    findAll(): Promise<Resume[]>;
    findOne(id: string): Promise<Resume | undefined>;
    create(resume: Resume): Promise<Resume>;
    update(id: string, resume: Resume): Promise<Resume | undefined>;
    remove(id: string): Promise<boolean>;
}
