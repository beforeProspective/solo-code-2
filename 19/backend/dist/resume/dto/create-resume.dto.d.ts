export declare class CreateResumeDto {
    title: string;
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
    experience: Array<{
        id?: string;
        company: string;
        position: string;
        startDate: string;
        endDate: string;
        description: string;
    }>;
    education: Array<{
        id?: string;
        school: string;
        degree: string;
        field: string;
        startDate: string;
        endDate: string;
    }>;
    skills: Array<{
        id?: string;
        name: string;
        level: string;
    }>;
    projects?: Array<{
        id?: string;
        name: string;
        description: string;
        technologies: string;
        link?: string;
    }>;
    template?: string;
    primaryColor?: string;
}
export declare class UpdateResumeDto extends CreateResumeDto {
}
