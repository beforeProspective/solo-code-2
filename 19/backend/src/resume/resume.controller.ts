import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { ResumeService } from './resume.service';
import { CreateResumeDto, UpdateResumeDto } from './dto/create-resume.dto';
import { Resume } from './resume.entity';

@Controller('api/resumes')
export class ResumeController {
  constructor(private readonly resumeService: ResumeService) {}

  @Get()
  findAll(): Promise<Resume[]> {
    return this.resumeService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<Resume> {
    return this.resumeService.findOne(id);
  }

  @Post()
  create(@Body() createResumeDto: CreateResumeDto): Promise<Resume> {
    return this.resumeService.create(createResumeDto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateResumeDto: UpdateResumeDto,
  ): Promise<Resume> {
    return this.resumeService.update(id, updateResumeDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<void> {
    return this.resumeService.remove(id);
  }
}
