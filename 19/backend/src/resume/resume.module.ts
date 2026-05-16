import { Module } from '@nestjs/common';
import { ResumeService } from './resume.service';
import { ResumeController } from './resume.controller';
import { StorageService } from './storage.service';

@Module({
  controllers: [ResumeController],
  providers: [ResumeService, StorageService],
})
export class ResumeModule {}
