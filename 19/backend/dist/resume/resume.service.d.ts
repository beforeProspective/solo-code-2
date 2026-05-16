import { StorageService } from './storage.service';
import { CreateResumeDto, UpdateResumeDto } from './dto/create-resume.dto';
import { Resume } from './resume.entity';
export declare class ResumeService {
    private storageService;
    constructor(storageService: StorageService);
    findAll(): Promise<Resume[]>;
    findOne(id: string): Promise<Resume>;
    create(createResumeDto: CreateResumeDto): Promise<Resume>;
    update(id: string, updateResumeDto: UpdateResumeDto): Promise<Resume>;
    remove(id: string): Promise<void>;
}
