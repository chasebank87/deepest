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
    private currentReasoning: string = '';
    private breadth: number;
    private isCanceled: boolean = false;

    constructor(
        private settings: DeepestSettings, 
        view: ResearchView,
        private app: App
    ) {
        this.view = view;
        this.breadth = 5;  // Initialize with default value
    }

    private debug(message: string, data?: any, isRequest: boolean = false) {
        if (this.settings.debugMode) {
            if (!isRequest || this.settings.includeRequests) {
                console.log(`[Deepest Debug] ${message}`, data || '');
            }
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

        const systemPrompt = markdownPrompts.some(p => prompt.startsWith(p)) 
            ? SYSTEM_PROMPTS.MARK_MAIN 
            : SYSTEM_PROMPTS.MAIN;
        
        // Log the request if enabled
        this.debug('Request:', { prompt, systemPrompt }, true);
        
        const response = await provider.chatCompletion(prompt, systemPrompt, {
            maxTokens: this.settings.maxTokens,
            temperature: this.settings.temperature
        });

        // Extract thinking section if present
        const thinkMatch = response.match(/<think>(.*?)<\/think>/s);
        if (thinkMatch) {
            this.currentReasoning = thinkMatch[1].trim();
            // Only debug reasoning if enabled
            if (this.settings.includeReasoning) {
                this.debug('AI Reasoning:', this.currentReasoning);
            }
            // Return everything after </think>
            const outputMatch = response.match(/<\/think>(.*?)$/s);
            return outputMatch ? outputMatch[1].trim() : response;
        } else {
            if (this.settings.includeReasoning) {
                this.debug('AI Reasoning: No reasoning provided');
            }
            return response;
        }
    }

    async getFeedbackQuestions(topic: string): Promise<string[]> {
        try {
            const provider = ProviderFactory.createLLMProvider(this.settings);
            if (!provider) {
                throw new Error('No LLM provider configured');
            }

            this.debug('Generating feedback questions for topic:', topic);

            const prompt = CHAT_PROMPTS.FEEDBACK(topic);
            const response = await this.getChatCompletion(prompt);
            
            this.debug('Feedback questions response:', response);

            const contentAfterThink = response
                .replace(/<think>[\s\S]*?<\/think>/, '')
                .replace(/^\n+/, '');
            
            this.debug('Content after think:', contentAfterThink);

            const questions = contentAfterThink
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0 && line.endsWith('?'));

            if (questions.length !== 3) {
                this.debug('Invalid number of questions:', questions.length);
                throw new Error('Invalid response format - expected exactly 3 questions');
            }

            return questions;

        } catch (error) {
            this.debug('Error getting feedback questions:', error);
            throw new Error(`Failed to get feedback questions: ${(error as Error).message}`);
        }
    }

    private async getSections(topic: string, feedback: ResearchAnswer[], breadth: number): Promise<string[]> {
        try {
            const prompt = RESEARCH_PROMPTS.SECTIONS(topic, feedback, breadth);
            const response = await this.getChatCompletion(prompt);
            
            // Split response into sections
            const sections = response
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);
            
            // Validate number of sections
            const expectedSections = breadth + 2;
            if (sections.length !== expectedSections) {
                throw new Error(`Invalid number of sections: expected ${expectedSections}, got ${sections.length}`);
            }
            
            this.debug('Generated sections:', sections);
            return sections;
            
        } catch (error) {
            this.debug('Error generating sections:', error);
            throw new Error(`Error generating sections: ${(error as Error).message}`);
        }
    }

    async handleCompletion(topic: string, answers: ResearchAnswer[], breadth: number) {
        // Reserved for future use
    }

    async deepResearch(topic: string, answers: ResearchAnswer[], depth: number, breadth: number): Promise<ResearchData> {
        try {
            this.isCanceled = false;  // Reset at start of new research
            
            // Initialize progress display immediately
            this.view.updateProgress(this.createProgressUpdate(
                'Starting Research',
                0,
                1,
                'Initializing research process...'
            ));
            
            // Reset state
            this.sectionLearnings = [];
            this.sectionContent = [];
            this.currentTopic = topic;
            this.breadth = breadth;

            // Step 1: Generate sections
            this.checkCancellation();
            const sections = await this.getSections(topic, answers, breadth);
            
            // Update progress with first section immediately after getting sections
            this.view.updateProgress(this.createProgressUpdate(
                'Processing Sections',
                1,
                sections.length,
                `Starting with section: ${sections[0]}`
            ));

            // Step 2: Generate title
            this.view.updateProgress(this.createProgressUpdate('Generating Title', 0, 1));
            this.checkCancellation();
            const title = await this.getTitle(topic, sections);
            this.view.updateProgress(this.createProgressUpdate('Generating Title', 1, 1));

            // Step 3: Generate introduction
            this.view.updateProgress(this.createProgressUpdate('Generating Introduction', 0, 1));
            this.checkCancellation();
            const introduction = await this.getIntro(topic, sections);
            this.view.updateProgress(this.createProgressUpdate('Generating Introduction', 1, 1));

            // Process sections in parallel batches
            const sectionBatchSize = 2; // Process 2 sections at a time
            const sectionBatches = [];
            
            for (let i = 0; i < sections.length; i += sectionBatchSize) {
                const batch = sections.slice(i, i + sectionBatchSize);
                sectionBatches.push(batch);
            }

            for (const sectionBatch of sectionBatches) {
                this.checkCancellation();
                
                // Process each section in the batch in parallel
                const sectionPromises = sectionBatch.map(async (section) => {
                    this.updateProgress({
                        step: {
                            phase: 'Processing Section',
                            current: sections.indexOf(section) + 1,
                            total: sections.length,
                            detail: `Processing: ${section}`
                        },
                        totalProgress: 30 + (sections.indexOf(section) / sections.length) * 40
                    });

                    // Get initial queries
                    const queries = await this.getSerpQueries(section, []);
                    
                    // Search all queries in parallel
                    const searchPromises = queries.map(query => this.search(query, breadth));
                    const searchResults = await Promise.all(searchPromises);
                    const flatResults = searchResults.flat();
                    
                    // Process search results
                    await this.processSearchResults(section, flatResults);

                    // Handle gap analysis in parallel batches
                    for (let d = 0; d < depth; d++) {
                        this.checkCancellation();
                        const gaps = await this.getGaps(section);
                        if (gaps.length === 0) break;

                        const gapQueries = await this.getSerpQueries(section, gaps);
                        const gapSearchPromises = gapQueries.map(query => this.search(query, breadth));
                        const gapResults = await Promise.all(gapSearchPromises);
                        await this.processSearchResults(section, gapResults.flat());
                    }
                });

                await Promise.all(sectionPromises);
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

            this.checkCancellation();
            const conclusion = await this.getConclusion(topic);

            // Add final progress update
            this.view.updateProgress(this.createProgressUpdate(
                'Research Complete',
                1,
                1,
                'Research report generated successfully'
            ));

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
            if ((error as Error).message === 'Research cancelled by user') {
                this.debug('Research cancelled by user');
                throw error;
            }
            this.debug('Error in deep research:', error);
            throw new Error(`Research failed: ${(error as Error).message}`);
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

    async getSerpQueries(section: string, gaps?: string[]): Promise<string[]> {
        try {
            const provider = ProviderFactory.createLLMProvider(this.settings);
            if (!provider) {
                throw new Error('No LLM provider configured');
            }

            this.debug('Generating SERP queries for:', { section, gaps });

            const prompt = RESEARCH_PROMPTS.SERP(
                this.currentTopic,
                section,
                this.breadth,
                gaps
            );

            const response = await this.getChatCompletion(prompt);
            
            this.debug('SERP queries response:', response);

            // Get content after think section and trim leading newlines
            const contentAfterThink = response
                .replace(/<think>[\s\S]*?<\/think>/, '')  // Remove think section
                .replace(/^\n+/, '');  // Remove leading newlines
            
            this.debug('Content after think:', contentAfterThink);

            // Split on newlines and clean up
            const queries = contentAfterThink
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);

            if (queries.length === 0) {
                throw new Error('No valid search queries generated');
            }

            if (queries.length > this.breadth) {
                this.debug('Too many queries, truncating to breadth:', this.breadth);
                queries.length = this.breadth;
            }

            this.debug('Parsed SERP queries:', queries);
            return queries;

        } catch (error) {
            this.debug('Error generating SERP queries:', error);
            throw new Error(`Failed to generate search queries: ${(error as Error).message}`);
        }
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
        // If text is within token limit, return as single chunk
        if (text.length <= this.settings.maxTokens * 4) {  // Using 4 chars per token approximation
            return [text];
        }
        
        // Otherwise, proceed with chunking
        const maxChunkTokens = this.settings.maxTokens;
        const charsPerChunk = maxChunkTokens * 4;  // Rough approximation: 1 token ≈ 4 characters
        
        this.debug('Splitting content with settings:', {
            maxTokens: this.settings.maxTokens,
            contentLength: text.length,
            charsPerChunk
        });

        const chunks: string[] = [];
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
                // Split response into lines and filter empty lines
                return response.split('\n').filter(line => line.trim());
            } catch (error) {
                if (attempt === retryCount) {
                    this.debug(`Failed to process chunk after ${retryCount} attempts:`, error);
                    return [];
                }
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        return [];
    }

    private async processSearchResults(section: string, searchResults: SearchResult[]): Promise<string[]> {
        try {
            const batchSize = 3; // Process 3 results at a time
            const batches = [];
            const allLearnings: string[] = [];
            
            // Create batches
            for (let i = 0; i < searchResults.length; i += batchSize) {
                const batch = searchResults.slice(i, i + batchSize);
                batches.push(batch);
            }

            // Process batches sequentially, but items within each batch in parallel
            for (const batch of batches) {
                this.checkCancellation();
                
                // Process each result in the batch in parallel
                const batchPromises = batch.map(result => 
                    this.extractAndGradeLearnings(section, result.url, result.content || result.snippet)
                );
                
                const batchResults = await Promise.all(batchPromises);
                
                // Add filtered learnings to the collection
                const filteredLearnings = batchResults.flat().filter(learning => learning);
                allLearnings.push(...filteredLearnings);
                
                // Update section learnings (but don't duplicate!)
                const existingSection = this.sectionLearnings.find(sl => sl.section === section);
                if (existingSection) {
                    existingSection.learnings.push(...filteredLearnings);
                } else {
                    this.sectionLearnings.push({
                        section,
                        learnings: filteredLearnings
                    });
                }
            }

            return allLearnings;

        } catch (error) {
            this.debug('Error processing search results:', error);
            throw new Error(`Failed to process search results: ${(error as Error).message}`);
        }
    }

    private async extractAndGradeLearnings(section: string, url: string, text: string): Promise<string[]> {
        const maxRetries = 1;
        let retryCount = 0;

        while (retryCount <= maxRetries) {
            try {
                this.checkCancellation();
                
                const prompt = RESEARCH_PROMPTS.LEARNING(
                    this.currentTopic,
                    section,
                    url, 
                    text,
                    url
                );
                
                const response = await this.getChatCompletion(prompt);
                
                // Parse graded learnings and sort by grade
                const gradedLearnings = response
                    .split('\n')
                    .map(line => line.trim())
                    .filter(line => line.length > 0)
                    .map(line => {
                        const [gradeStr, ...rest] = line.split(' ');
                        const grade = parseInt(gradeStr);
                        const learning = rest.join(' ');
                        return { grade, learning };
                    })
                    .filter(({ grade }) => !isNaN(grade))
                    .sort((a, b) => b.grade - a.grade); // Sort by grade descending

                // If no learnings found and we haven't exceeded retries, try again
                if (gradedLearnings.length === 0 && retryCount < maxRetries) {
                    this.debug('No learnings found, retrying...', { section, url, retryCount });
                    retryCount++;
                    // Wait a bit before retrying
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    continue;
                }

                // Take only the top 5 learnings
                const topLearnings = gradedLearnings
                    .slice(0, 5)
                    .map(({ learning }) => learning);

                this.debug('Extracted and filtered learnings:', {
                    section,
                    url,
                    originalCount: gradedLearnings.length,
                    filteredCount: topLearnings.length,
                    learnings: topLearnings,
                    retryCount
                });

                return topLearnings;

            } catch (error) {
                if (retryCount < maxRetries) {
                    this.debug('Error extracting learnings, retrying:', error);
                    retryCount++;
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    continue;
                }
                this.debug('Error extracting and grading learnings:', error);
                return []; // Return empty array on error to maintain flow
            }
        }

        return []; // Return empty array if all retries failed
    }

    async synthesizeSections(topic: string, sections: string[]): Promise<void> {
        try {
            this.currentTopic = topic;
            
            // Print final learnings for each section before synthesis
            this.debug('Final learnings before synthesis:', this.sectionLearnings.map(sl => ({
                section: sl.section,
                learningCount: sl.learnings.length,
                learnings: sl.learnings
            })));
            
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
            // Sanitize the file name before saving
            const sanitizedTitle = this.sanitizeFileName(researchData.title);
            const fileName = `${sanitizedTitle}.md`;
            const filePath = normalizePath(`${this.settings.outputFolder}/${fileName}`);

            // Create content and save file
            const content = this.formatResearchContent(researchData);
            await this.app.vault.adapter.write(filePath, content);
            
            this.debug('Research saved to:', filePath);
            new Notice(`Research saved to: ${fileName}`);
        } catch (error) {
            this.debug('Error saving research:', error);
            throw new Error(`Error saving research file: ${(error as Error).message}`);
        }
    }

    private sanitizeFileName(fileName: string): string {
        // Remove characters that are not allowed in file names
        // This includes: \ / : * ? " < > | and #
        return fileName
            .replace(/[\\/:*?"<>|#]/g, '-')  // Replace illegal chars and # with dash
            .replace(/\s+/g, ' ')           // Replace multiple spaces with single space
            .replace(/^\s+|\s+$/g, '')      // Trim spaces from start and end
            .replace(/^-+|-+$/g, '');       // Trim dashes from start and end
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
        try {
            const learnings = this.getLearningsForSection(section);
            if (!learnings.length) {
                this.debug('No learnings found for section:', section);
                return [];
            }

            const prompt = RESEARCH_PROMPTS.GAP(section, learnings);
            let response = await this.getChatCompletion(prompt);
            
            this.debug('Gaps response:', response);
            
            // Extract thinking section if present
            const thinkMatch = response.match(/<think>(.*?)<\/think>/s);
            if (thinkMatch) {
                this.debug('Gap Analysis Reasoning:', thinkMatch[1].trim());
                // Get everything after </think>
                const outputMatch = response.match(/<\/think>(.*?)$/s);
                if (!outputMatch) return [];
                response = outputMatch[1].trim();
            }

            // Split into lines and filter empty ones
            const gaps = response
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);

            this.debug('Parsed gaps:', gaps);
            return gaps;

        } catch (error) {
            this.debug('Error finding gaps:', error);
            throw new Error(`Failed to find knowledge gaps: ${(error as Error).message}`);
        }
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

    private checkCancellation() {
        if (this.isCanceled) {
            this.isCanceled = false; // Reset for next research
            throw new Error('Research cancelled by user');
        }
    }

    async cancelResearch() {
        this.isCanceled = true;
        this.debug('Research cancelled by user');
        
        // Reset all state
        this.sectionLearnings = [];
        this.sectionContent = [];
        this.currentTopic = '';
        this.currentReasoning = '';
    }

    private async extractLearnings(section: string, url: string, text: string): Promise<string[]> {
        try {
            const provider = ProviderFactory.createLLMProvider(this.settings);
            if (!provider) {
                throw new Error('No LLM provider configured');
            }

            const prompt = RESEARCH_PROMPTS.LEARNING(section, url, text);
            const response = await this.getChatCompletion(prompt);
            
            // Split response into individual learnings
            const learnings = response
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);
            
            this.debug('Extracted learnings:', {
                section,
                url,
                learnings
            });

            return learnings;

        } catch (error) {
            this.debug('Error extracting learnings:', error);
            throw new Error(`Failed to extract learnings: ${(error as Error).message}`);
        }
    }

    private formatResearchContent(researchData: ResearchData): string {
        let content = '';

        // Add title as H1
        content += `${researchData.title}\n\n`;

        // Add introduction
        content += `## Introduction\n\n`;
        content += `${researchData.introduction}\n\n`;

        // Add each section's content
        for (const section of researchData.sections) {
            const sectionContent = this.getSectionContent(section);
            content += `${sectionContent}\n\n`;
        }

        // Add conclusion
        try {
            const conclusionData = JSON.parse(researchData.conclusion);
            content += Array.isArray(conclusionData) ? conclusionData[0] : conclusionData;
        } catch {
            content += researchData.conclusion;
        }

        return content;
    }
} 