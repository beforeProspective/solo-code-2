import { ResumeService } from './resume.service';
import { CreateResumeDto, UpdateResumeDto } from './dto/create-resume.dto';
import { Resume } from './resume.entity';
export declare class ResumeController {
    private readonly resumeService;
    constructor(resumeService: ResumeService);
    findAll(): Promise<Resume[]>;
    findOne(id: string): Promise<Resume>;
    create(createResumeDto: CreateResumeDto): Promise<Resume>;
    update(id: string, updateResumeDto: UpdateResumeDto): Promise<Resume>;
    remove(id: string): Promise<void>;
}
