"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResumeService = void 0;
const common_1 = require("@nestjs/common");
const uuid_1 = require("uuid");
const storage_service_1 = require("./storage.service");
const ensureIds = (items) => items.map((item) => ({ ...item, id: item.id || (0, uuid_1.v4)() }));
let ResumeService = class ResumeService {
    constructor(storageService) {
        this.storageService = storageService;
    }
    async findAll() {
        return this.storageService.findAll();
    }
    async findOne(id) {
        const resume = await this.storageService.findOne(id);
        if (!resume) {
            throw new common_1.NotFoundException(`Resume with ID ${id} not found`);
        }
        return resume;
    }
    async create(createResumeDto) {
        const now = new Date();
        const resume = {
            id: (0, uuid_1.v4)(),
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
    async update(id, updateResumeDto) {
        const existing = await this.findOne(id);
        const updated = {
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
            throw new common_1.NotFoundException(`Resume with ID ${id} not found`);
        }
        return result;
    }
    async remove(id) {
        const success = await this.storageService.remove(id);
        if (!success) {
            throw new common_1.NotFoundException(`Resume with ID ${id} not found`);
        }
    }
};
exports.ResumeService = ResumeService;
exports.ResumeService = ResumeService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [storage_service_1.StorageService])
], ResumeService);
//# sourceMappingURL=resume.service.js.map