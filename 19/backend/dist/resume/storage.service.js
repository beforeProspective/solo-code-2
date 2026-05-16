"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StorageService = void 0;
const common_1 = require("@nestjs/common");
const fs = require("fs");
const path = require("path");
let StorageService = class StorageService {
    constructor() {
        this.dataDir = path.join(process.cwd(), 'data');
        this.dataFile = path.join(this.dataDir, 'resumes.json');
    }
    onModuleInit() {
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }
        if (!fs.existsSync(this.dataFile)) {
            fs.writeFileSync(this.dataFile, JSON.stringify([]));
        }
    }
    async readAll() {
        try {
            const data = fs.readFileSync(this.dataFile, 'utf-8');
            return JSON.parse(data);
        }
        catch {
            return [];
        }
    }
    async writeAll(resumes) {
        fs.writeFileSync(this.dataFile, JSON.stringify(resumes, null, 2));
    }
    async findAll() {
        const resumes = await this.readAll();
        return resumes.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    }
    async findOne(id) {
        const resumes = await this.readAll();
        return resumes.find((r) => r.id === id);
    }
    async create(resume) {
        const resumes = await this.readAll();
        resumes.push(resume);
        await this.writeAll(resumes);
        return resume;
    }
    async update(id, resume) {
        const resumes = await this.readAll();
        const index = resumes.findIndex((r) => r.id === id);
        if (index !== -1) {
            resumes[index] = resume;
            await this.writeAll(resumes);
            return resume;
        }
        return undefined;
    }
    async remove(id) {
        const resumes = await this.readAll();
        const filtered = resumes.filter((r) => r.id !== id);
        if (filtered.length !== resumes.length) {
            await this.writeAll(filtered);
            return true;
        }
        return false;
    }
};
exports.StorageService = StorageService;
exports.StorageService = StorageService = __decorate([
    (0, common_1.Injectable)()
], StorageService);
//# sourceMappingURL=storage.service.js.map