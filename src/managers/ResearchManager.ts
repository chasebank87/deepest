import { Notice, App, normalizePath } from 'obsidian';
import { CHAT_PROMPTS } from '../prompts';
import { ProviderFactory } from '../providers/ProviderFactory';
import { DeepestSettings } from '../settings';
import { RESEARCH_PROMPTS } from '../prompts';
import { ResearchView } from '../views/ResearchView';
import { ResearchAnswer, ResearchData, ProgressUpdate, SectionLearnings } from '../types';
import { SearchResult } from '../providers/WebSearchProvider';
import { SYSTEM_PROMPTS } from '../prompts';

export class ResearchManager {
    private view: ResearchView;
    private sectionLearnings: SectionLearnings[] = [];
    private sectionContent: { section: string; content: string }[] = [];
    private currentTopic: string = '';

    constructor(
        private settings: DeepestSettings, 
        view: ResearchView,
        private app: App
    ) {
        this.view = view;
    }

    private debug(message: string, data?: any) {
        if (this.settings.debugMode) {
            console.log(`[Deepest Debug] ${message}`, data || '');
        }
    }

    private async getChatCompletion(prompt: string): Promise<string> {
        const provider = ProviderFactory.createLLMProvider(this.settings);
        if (!provider) {
            throw new Error('No LLM provider configured');
        }

        // Only these prompts should use MARK_MAIN (they return markdown)
        const markdownPrompts = [
            RESEARCH_PROMPTS.SYNTHESIZE.toString(),
            RESEARCH_PROMPTS.CONCLUSION.toString()
        ];

        // All other prompts should use MAIN (they return JSON)
        const systemPrompt = markdownPrompts.some(p => prompt.startsWith(p)) 
            ? SYSTEM_PROMPTS.MARK_MAIN 
            : SYSTEM_PROMPTS.MAIN;
        
        return provider.chatCompletion(prompt, systemPrompt, {
            maxTokens: this.settings.maxTokens,
            temperature: this.settings.temperature
        });
    }

    async getFeedbackQuestions(topic: string): Promise<string[]> {
        try {
            const provider = ProviderFactory.createLLMProvider(this.settings);
            if (!provider) {
                throw new Error('No LLM provider configured');
            }

            const prompt = CHAT_PROMPTS.FEEDBACK(topic);
            const response = await this.getChatCompletion(prompt);
            
            // Response is already a JSON string of the output array
            const questions = JSON.parse(response);
            if (!Array.isArray(questions) || questions.length !== 3) {
                throw new Error('Invalid response format');
            }

            return questions;
        } catch (error) {
            throw new Error(`Failed to get feedback questions: ${(error as Error).message}`);
        }
    }

    async getSections(topic: string, answers: ResearchAnswer[], breadth: number): Promise<string[]> {
        try {
            const provider = ProviderFactory.createLLMProvider(this.settings);
            if (!provider) {
                throw new Error('No LLM provider configured');
            }
            
            this.debug('Generating sections with:', {
                topic,
                answers,
                breadth
            });

            // Format the feedback data to include both questions and answers
            const feedbackData = answers.map(a => ({
                question: a.question,
                answer: a.answer
            }));

            const prompt = RESEARCH_PROMPTS.SECTIONS(
                topic,
                feedbackData,
                breadth
            );

            const response = await this.getChatCompletion(prompt);
            
            this.debug('Sections response:', response);

            const sections = JSON.parse(response);
            
            this.debug('Parsed sections:', sections);
            return sections;

        } catch (error) {
            this.debug('Error generating sections:', error);
            throw new Error(`Failed to generate sections: ${(error as Error).message}`);
        }
    }

    async handleCompletion(topic: string, answers: ResearchAnswer[], breadth: number) {
        // Reserved for future use
    }

    async deepResearch(topic: string, answers: ResearchAnswer[], depth: number, breadth: number): Promise<ResearchData> {
        try {
            this.debug('Starting deep research:', {
                topic,
                answers,
                depth,
                breadth
            });

            this.currentTopic = topic;

            // Step 1: Generate sections
            this.view.updateProgress(this.createProgressUpdate('Generating Sections', 0, 1));
            const sections = await this.getSections(topic, answers, breadth);
            this.view.updateProgress(this.createProgressUpdate('Generating Sections', 1, 1));

            // Step 2: Generate title
            this.view.updateProgress(this.createProgressUpdate('Generating Title', 0, 1));
            const title = await this.getTitle(topic, sections);
            this.view.updateProgress(this.createProgressUpdate('Generating Title', 1, 1));

            // Step 3: Generate introduction
            this.view.updateProgress(this.createProgressUpdate('Generating Introduction', 0, 1));
            const introduction = await this.getIntro(topic, sections);
            this.view.updateProgress(this.createProgressUpdate('Generating Introduction', 1, 1));

            // Step 4: Process sections in parallel
            for (let i = 0; i < sections.length; i++) {
                this.view.updateProgress(this.createProgressUpdate(
                    'Generating Search Queries',
                    i,
                    sections.length,
                    `For section: ${sections[i]}`
                ));

                const queries = await this.getQueries(topic, sections[i], breadth);
                this.debug(`Queries for section "${sections[i]}":`, queries);

                // Search all queries in parallel
                const searchPromises = queries.map(query => this.search(query, breadth));
                const allResults = await Promise.all(searchPromises);
                
                // Flatten results and process them in parallel
                const flatResults = allResults.flat();
                const sectionResult = await this.processSearchResults(flatResults, sections[i]);
                
                // Store the learnings
                this.sectionLearnings.push(sectionResult);

                // Gap analysis and deeper research
                for (let d = 0; d < depth; d++) {
                    const gaps = await this.getGaps(sections[i]);
                    if (gaps.length === 0) break;

                    const gapQueries = await this.getQueries(topic, sections[i], breadth, gaps);
                    
                    // Process gap queries in parallel
                    const gapSearchPromises = gapQueries.map(query => this.search(query, breadth));
                    const gapResults = await Promise.all(gapSearchPromises);
                    const gapResult = await this.processSearchResults(gapResults.flat(), sections[i]);
                    
                    // Store gap learnings
                    const existingSection = this.sectionLearnings.find(sl => sl.section === sections[i]);
                    if (existingSection) {
                        existingSection.learnings.push(...gapResult.learnings);
                    }
                }
            }

            // Synthesize all sections in parallel
            await this.synthesizeSections(topic, sections);

            // After all sections are processed, before returning researchData
            // Generate conclusion
            this.view.updateProgress(this.createProgressUpdate(
                'Generating Conclusion',
                0,
                1,
                'Creating final conclusion'
            ));

            const conclusion = await this.getConclusion(topic);

            const researchData: ResearchData = {
                topic,
                title,
                introduction,
                sections,
                sectionContent: this.sectionContent,
                conclusion,
                depth
            };

            this.debug('Research data prepared:', researchData);

            // Will handle:
            // 5. Research each section
            // 6. Generate content
            // 7. Format and structure the report
            // 8. Handle citations and sources
            // 9. Create final document

            await this.saveResearchToFile(researchData);
            return researchData;

        } catch (error) {
            this.debug('Error in deep research:', error);
            throw new Error(`Failed to complete deep research: ${(error as Error).message}`);
        }
    }

    async getTitle(topic: string, sections: string[]): Promise<string> {
        try {
            const provider = ProviderFactory.createLLMProvider(this.settings);
            if (!provider) {
                throw new Error('No LLM provider configured');
            }
            
            this.debug('Generating title with:', {
                topic,
                sections
            });

            const prompt = RESEARCH_PROMPTS.TITLE(
                topic,
                sections
            );

            const response = await this.getChatCompletion(prompt);
            
            this.debug('Title response:', response);

            // Response should be a plain string, no need for JSON parsing
            return response.trim();

        } catch (error) {
            this.debug('Error generating title:', error);
            throw new Error(`Failed to generate title: ${(error as Error).message}`);
        }
    }

    async getIntro(topic: string, sections: string[]): Promise<string> {
        try {
            const provider = ProviderFactory.createLLMProvider(this.settings);
            if (!provider) {
                throw new Error('No LLM provider configured');
            }
            
            this.debug('Generating introduction with:', {
                topic,
                sections
            });

            const prompt = RESEARCH_PROMPTS.INTRO(
                topic,
                sections
            );

            const response = await this.getChatCompletion(prompt);
            
            this.debug('Introduction response:', response);

            // Response should be plain text
            return response.trim();

        } catch (error) {
            this.debug('Error generating introduction:', error);
            throw new Error(`Failed to generate introduction: ${(error as Error).message}`);
        }
    }

    private calculateTotalSteps(): number {
        const FIXED_STEPS = {
            SECTIONS: 1,
            TITLE: 1,
            INTRO: 1,
            RESEARCH: 1,
            GAPS: 1,
            SYNTHESIZE: 1,
            CONCLUSION: 1
        };
        
        return Object.values(FIXED_STEPS).reduce((a, b) => a + b, 0);
    }

    private createProgressUpdate(phase: string, current: number, total: number, detail?: string): ProgressUpdate {
        let progress = 0;
        
        switch (phase) {
            case 'Generating Sections':
                progress = (current / total) * 15;
                break;
            case 'Generating Title':
                progress = 15 + (current / total) * 10;
                break;
            case 'Generating Introduction':
                progress = 25 + (current / total) * 10;
                break;
            case 'Generating Search Queries':
            case 'Searching Web':
            case 'Extracting Learnings':
                progress = 35 + (current / total) * 25;
                break;
            case 'Analyzing Gaps':
            case 'Researching Gaps':
                progress = 60 + (current / total) * 20;
                break;
            case 'Synthesizing Content':
                progress = 80 + (current / total) * 10;
                break;
            case 'Generating Conclusion':
                progress = 90 + (current / total) * 10;
                break;
        }
        
        return {
            step: { phase, current, total, detail },
            totalProgress: Math.min(Math.round(progress), 100)
        };
    }

    async getQueries(topic: string, section: string, breadth: number, gaps?: string[]): Promise<string[]> {
        const maxRetries = 1;
        
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const prompt = RESEARCH_PROMPTS.SERP(
                    topic,
                    section,
                    breadth,
                    gaps
                );

                const response = await this.getChatCompletion(prompt);
                this.debug('Search queries response:', response);

                const queries = JSON.parse(response);
                
                // Validate response format
                if (!Array.isArray(queries) || queries.some(q => typeof q !== 'string')) {
                    if (attempt < maxRetries) {
                        this.debug('Invalid query format, retrying...');
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        continue;
                    }
                    throw new Error('Invalid query format returned from LLM');
                }
                
                this.debug('Parsed queries:', queries);
                return queries;

            } catch (error) {
                if (attempt < maxRetries) {
                    this.debug('Error generating queries, retrying:', error);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    continue;
                }
                this.debug('Error generating search queries:', error);
                throw new Error(`Failed to generate search queries: ${(error as Error).message}`);
            }
        }
        
        // This should never be reached due to the throw above, but TypeScript needs it
        return [];
    }

    async search(query: string, maxResults: number, isRetry: boolean = false): Promise<SearchResult[]> {
        try {
            const provider = ProviderFactory.createWebSearchProvider(this.settings);
            if (!provider) {
                throw new Error('No web search provider configured');
            }
            
            this.debug('Searching with query:', {
                query,
                isRetry
            });

            const resultsToGet = isRetry ? maxResults + 1 : maxResults;
            const results = await provider.search(query, resultsToGet);
            
            // Filter and sort results
            const validResults = results
                .filter(r => r.content)
                .sort((a, b) => {
                    // First try to sort by score if available
                    if ('score' in a && 'score' in b) {
                        return (b.score || 0) - (a.score || 0);
                    }
                    // Fallback to content length
                    return (b.content?.length || 0) - (a.content?.length || 0);
                })
                // Take top 2 results
                .slice(0, 2);

            if (validResults.length === 0 && !isRetry) {
                this.debug('No valid results found, retrying with increased maxResults');
                return this.search(query, maxResults, true);
            }

            this.debug('Filtered search results:', validResults);
            return validResults;

        } catch (error) {
            this.debug('Error in web search:', error);
            throw new Error(`Failed to perform web search: ${(error as Error).message}`);
        }
    }

    private splitIntoChunks(text: string): string[] {
        // Use settings maxTokens * 2 for chunk size
        const maxChunkTokens = this.settings.maxTokens * 2;
        const charsPerChunk = maxChunkTokens * 4;  // Rough approximation: 1 token ≈ 4 characters
        
        this.debug('Splitting content with settings:', {
            maxTokens: this.settings.maxTokens,
            maxChunkTokens,
            charsPerChunk
        });

        const chunks: string[] = [];
        
        // Split by paragraphs first
        const paragraphs = text.split(/\n\s*\n/);
        let currentChunk = '';

        for (const paragraph of paragraphs) {
            if ((currentChunk + paragraph).length > charsPerChunk) {
                if (currentChunk) {
                    chunks.push(currentChunk.trim());
                    currentChunk = '';
                }
                // If paragraph itself is too long, split it
                if (paragraph.length > charsPerChunk) {
                    const sentencesInParagraph = paragraph.match(/[^.!?]+[.!?]+/g) || [];
                    for (const sentence of sentencesInParagraph) {
                        if ((currentChunk + sentence).length > charsPerChunk) {
                            if (currentChunk) {
                                chunks.push(currentChunk.trim());
                                currentChunk = '';
                            }
                            chunks.push(sentence.trim());
                        } else {
                            currentChunk += sentence;
                        }
                    }
                } else {
                    currentChunk = paragraph;
                }
            } else {
                currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
            }
        }

        if (currentChunk) {
            chunks.push(currentChunk.trim());
        }

        return chunks;
    }

    private async processChunkWithRetry(section: string, url: string, chunk: string, retryCount = 1): Promise<string[]> {
        for (let attempt = 0; attempt <= retryCount; attempt++) {
            try {
                const prompt = RESEARCH_PROMPTS.LEARNING(section, url, chunk);
                const response = await this.getChatCompletion(prompt);
                return JSON.parse(response);
            } catch (error) {
                if (attempt === retryCount) {
                    this.debug(`Failed to process chunk after ${retryCount} attempts:`, error);
                    return []; // Return empty array instead of throwing
                }
                // Wait briefly before retry
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        return [];
    }

    private async processSearchResults(searchResults: SearchResult[], section: string): Promise<SectionLearnings> {
        try {
            // Process all search results in parallel
            const learningPromises = searchResults.map(async (result, index) => {
                this.updateProgress({
                    step: {
                        phase: 'Processing Search Results',
                        current: index + 1,
                        total: searchResults.length,
                        detail: `Analyzing: ${result.title}`
                    },
                    totalProgress: 40 + (index / searchResults.length) * 20
                });

                const text = result.content;
                if (!text) {
                    this.debug('Skipping result with no content:', result.url);
                    return [];
                }

                const chunks = this.splitIntoChunks(text);
                
                // Process each chunk in parallel with retry
                const chunkPromises = chunks.map(chunk => 
                    this.processChunkWithRetry(section, result.url, chunk)
                );

                const chunkResults = await Promise.all(chunkPromises);
                return chunkResults.flat();
            });

            // Wait for all learning extractions to complete
            const allLearnings = await Promise.all(learningPromises);
            const flatLearnings = allLearnings.flat();

            // Only fail if we got no learnings at all
            if (flatLearnings.length === 0) {
                throw new Error('No learnings could be extracted from any search results');
            }

            return {
                section,
                learnings: flatLearnings
            };

        } catch (error) {
            this.debug('Error processing search results:', error);
            throw new Error(`Failed to process search results: ${(error as Error).message}`);
        }
    }

    async synthesizeSections(topic: string, sections: string[]): Promise<void> {
        try {
            this.currentTopic = topic;
            // Synthesize all sections in parallel
            const synthesisPromises = sections.map(async (section, index) => {
                this.updateProgress({
                    step: {
                        phase: 'Synthesizing Sections',
                        current: index + 1,
                        total: sections.length,
                        detail: `Writing: ${section}`
                    },
                    totalProgress: 80 + (index / sections.length) * 15
                });

                const sectionLearnings = this.sectionLearnings.find(sl => sl.section === section);
                if (!sectionLearnings) {
                    throw new Error(`No learnings found for section: ${section}`);
                }

                const prompt = RESEARCH_PROMPTS.SYNTHESIZE(topic, section, sectionLearnings.learnings);
                const content = await this.getChatCompletion(prompt);
                
                return { section, content };
            });

            const synthesizedSections = await Promise.all(synthesisPromises);
            this.sectionContent = synthesizedSections;

        } catch (error) {
            this.debug('Error synthesizing sections:', error);
            throw new Error(`Failed to synthesize sections: ${(error as Error).message}`);
        }
    }

    getSectionContent(section: string): string {
        const sectionData = this.sectionContent.find(sc => sc.section === section);
        return sectionData?.content || '';
    }

    async getConclusion(topic: string): Promise<string> {
        const maxRetries = 1;
        
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                // Get all learnings from all sections
                const allLearnings = this.sectionLearnings.flatMap(sl => sl.learnings);
                
                const prompt = RESEARCH_PROMPTS.CONCLUSION(topic, allLearnings);
                const response = await this.getChatCompletion(prompt);
                
                this.debug('Conclusion response:', response);

                // Validate response format
                const parsed = JSON.parse(response);
                if (!Array.isArray(parsed) || !parsed[0]) {
                    if (attempt < maxRetries) {
                        this.debug('Invalid conclusion format, retrying...');
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        continue;
                    }
                    return JSON.stringify([`## Conclusion\n\n*Failed to generate conclusion.*`]);
                }

                return response;

            } catch (error) {
                if (attempt < maxRetries) {
                    this.debug('Error generating conclusion, retrying:', error);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    continue;
                }
                this.debug('Error generating conclusion after retries:', error);
                return JSON.stringify([`## Conclusion\n\n*Failed to generate conclusion.*`]);
            }
        }
        
        return JSON.stringify([`## Conclusion\n\n*Failed to generate conclusion.*`]);
    }

    async saveResearchToFile(researchData: ResearchData): Promise<void> {
        try {
            // Create file content
            let content = '';

            // Add title as H1
            content += `# ${researchData.title}\n\n`;

            // Helper function to safely parse and extract content
            const safeParseContent = (jsonStr: string): string => {
                try {
                    // First try to parse as JSON
                    const parsed = JSON.parse(jsonStr);
                    if (Array.isArray(parsed) && parsed[0]) {
                        // First replace escaped newlines with temporary marker
                        let content = parsed[0]
                            .replace(/\\n/g, '{{NEWLINE}}')  // Replace escaped newlines with marker
                            .replace(/[\x00-\x1F\x7F-\x9F]/g, '')  // Clean control characters
                            .replace(/{{NEWLINE}}{{NEWLINE}}/g, '\n\n')  // Convert double newlines to actual breaks
                            .replace(/{{NEWLINE}}/g, '\n')  // Convert single newlines to actual breaks
                            .replace(/\n\n+/g, '\n\n');  // Normalize multiple newlines
                        
                        return content;
                    }
                    return jsonStr.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
                } catch (error) {
                    return jsonStr.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
                }
            };

            // Add introduction
            content += `${safeParseContent(researchData.introduction)}\n\n`;

            // Add each section's content
            for (const section of researchData.sections) {
                const sectionContent = this.getSectionContent(section);
                content += `${safeParseContent(sectionContent)}\n\n`;
            }

            // Add conclusion
            content += `${safeParseContent(researchData.conclusion)}\n`;

            // Create folder if it doesn't exist
            const folderPath = 'Deep Research';
            if (!await this.app.vault.adapter.exists(folderPath)) {
                await this.app.vault.createFolder(folderPath);
            }

            // Use Obsidian's normalizePath for safe file names
            const fileName = normalizePath(`${folderPath}/${researchData.title}.md`);
            await this.app.vault.create(fileName, content);

            this.debug('Research file created:', fileName);

        } catch (error) {
            this.debug('Error saving research file:', error);
            throw new Error(`Failed to save research file: ${(error as Error).message}`);
        }
    }

    private sanitizeFileName(title: string): string {
        return title.replace(/[\\/:*?"<>|]/g, '-');
    }

    private updateProgress(progress: ProgressUpdate) {
        this.view.updateProgress(progress);
    }

    getLearningsForSection(section: string): string[] {
        this.debug('Current sectionLearnings:', this.sectionLearnings);
        this.debug('Looking for section:', section);
        const sectionData = this.sectionLearnings.find(sl => sl.section === section);
        this.debug('Found section data:', sectionData);
        return sectionData?.learnings || [];
    }

    getAllSectionLearnings(): SectionLearnings[] {
        return [...this.sectionLearnings];
    }

    async getGaps(section: string): Promise<string[]> {
        const maxRetries = 1;
        
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const learnings = this.getLearningsForSection(section);
                if (!learnings.length) {
                    this.debug('No learnings found for section:', section);
                    return [];
                }

                const prompt = RESEARCH_PROMPTS.GAP(section, learnings);
                const response = await this.getChatCompletion(prompt);
                
                this.debug('Gaps response:', response);
                
                // Try to clean the response if it contains markdown
                let cleanResponse = response;
                if (response.includes('```')) {
                    cleanResponse = response.replace(/```json\n|\n```/g, '');
                }
                
                const gaps = JSON.parse(cleanResponse);
                
                // Validate response format
                if (!Array.isArray(gaps) || gaps.some(g => typeof g !== 'string')) {
                    if (attempt < maxRetries) {
                        this.debug('Invalid gaps format, retrying...');
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        continue;
                    }
                    throw new Error('Invalid gaps format returned from LLM');
                }
                
                return gaps;

            } catch (error) {
                if (attempt < maxRetries) {
                    this.debug('Error finding gaps, retrying:', error);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    continue;
                }
                this.debug('Error finding gaps:', error);
                throw new Error(`Failed to find knowledge gaps: ${(error as Error).message}`);
            }
        }
        
        return [];
    }

    async synthesizeSection(section: string): Promise<string> {
        try {
            const provider = ProviderFactory.createLLMProvider(this.settings);
            if (!provider) {
                throw new Error('No LLM provider configured');
            }

            const learnings = this.getLearningsForSection(section);
            if (!learnings.length) {
                this.debug('No learnings found for section:', section);
                return '';
            }

            const prompt = RESEARCH_PROMPTS.SYNTHESIZE(this.currentTopic, section, learnings);
            const response = await this.getChatCompletion(prompt);
            
            this.debug('Synthesis response:', response);
            return response;

        } catch (error) {
            this.debug('Error synthesizing section:', error);
            throw new Error(`Failed to synthesize section: ${(error as Error).message}`);
        }
    }
} 