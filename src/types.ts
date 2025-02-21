export interface ResearchAnswer {
    question: string;
    answer: string;
}

export interface ResearchData {
    topic: string;
    title: string;
    introduction: string;
    sections: string[];
    sectionContent: { section: string; content: string }[];
    conclusion: string;
    depth: number;
}

export interface ProgressStep {
    phase: string;
    current: number;
    total: number;
    detail?: string;
}

export interface ProgressUpdate {
    step: ProgressStep;
    totalProgress: number; // 0-100
}

export interface SearchResult {
    title: string;
    url: string;
    snippet: string;
    content?: string; // Raw content if available
}

export interface SectionLearnings {
    section: string;
    learnings: string[];
} 