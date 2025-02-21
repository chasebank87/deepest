import { Notice, App } from 'obsidian';
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

        // List of prompts that should use MARK_MAIN
        const markdownPrompts = [
            RESEARCH_PROMPTS.SYNTHESIZE,
            RESEARCH_PROMPTS.CONCLUSION
        ];

        const systemPrompt = markdownPrompts.some(p => prompt.startsWith(p.toString())) 
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

            // Step 4: Generate SERP queries and get learnings for each section
            for (let i = 0; i < sections.length; i++) {
                this.view.updateProgress(this.createProgressUpdate(
                    'Generating Search Queries',
                    i,
                    sections.length,
                    `For section: ${sections[i]}`
                ));

                const queries = await this.getQueries(topic, sections[i], breadth);
                this.debug(`Queries for section "${sections[i]}":`, queries);

                // Search and extract learnings for each query
                for (const query of queries) {
                    this.view.updateProgress(this.createProgressUpdate(
                        'Searching Web',
                        i,
                        sections.length,
                        `Researching: ${sections[i]}`
                    ));

                    const results = await this.search(query, breadth);
                    this.debug(`Search results for query "${query}":`, results);

                    // Extract learnings from search results
                    this.view.updateProgress(this.createProgressUpdate(
                        'Extracting Learnings',
                        i,
                        sections.length,
                        `Learning from: ${sections[i]}`
                    ));

                    await this.getLearnings(sections[i], results);
                }

                // Inside deepResearch, before gap analysis:
                this.debug(`Before gap analysis for section "${sections[i]}", learnings:`, this.getLearningsForSection(sections[i]));

                // Analyze gaps and do deeper research based on depth setting
                for (let d = 0; d < depth; d++) {
                    const learningsBeforeGap = this.getLearningsForSection(sections[i]);
                    this.debug(`At depth ${d + 1}, section "${sections[i]}" has ${learningsBeforeGap.length} learnings`);

                    this.view.updateProgress(this.createProgressUpdate(
                        'Analyzing Gaps',
                        i * depth + d,
                        sections.length * depth,
                        `Finding gaps in: ${sections[i]} (Depth ${d + 1}/${depth})`
                    ));

                    const gaps = await this.getGaps(sections[i]);
                    this.debug(`Knowledge gaps for section "${sections[i]}" at depth ${d + 1}:`, gaps);

                    // If we found gaps, do another round of research
                    if (gaps.length > 0) {
                        this.view.updateProgress(this.createProgressUpdate(
                            'Researching Gaps',
                            i * depth + d,
                            sections.length * depth,
                            `Investigating gaps in: ${sections[i]} (Depth ${d + 1}/${depth})`
                        ));

                        const gapQueries = await this.getQueries(topic, sections[i], breadth, gaps);
                        this.debug(`Gap-based queries for section "${sections[i]}" at depth ${d + 1}:`, gapQueries);

                        // Search and learn from gap queries
                        for (const query of gapQueries) {
                            const results = await this.search(query, breadth);
                            await this.getLearnings(sections[i], results);
                        }
                    } else {
                        // No more gaps found, break the depth loop for this section
                        break;
                    }
                }

                // Synthesize section content after all research is complete
                this.view.updateProgress(this.createProgressUpdate(
                    'Synthesizing Content',
                    i,
                    sections.length,
                    `Synthesizing: ${sections[i]}`
                ));

                const content = await this.synthesizeSection(sections[i]);
                this.sectionContent.push({
                    section: sections[i],
                    content
                });

                // Clear previous section's learnings after we're completely done with it
                this.sectionLearnings = this.sectionLearnings.filter(sl => sl.section === sections[i]);
            }
            this.view.updateProgress(this.createProgressUpdate('Generating Search Queries', sections.length, sections.length));

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
        try {
            const provider = ProviderFactory.createLLMProvider(this.settings);
            if (!provider) {
                throw new Error('No LLM provider configured');
            }
            
            this.debug('Generating search queries for section:', {
                topic,
                section,
                breadth,
                gaps
            });

            const prompt = RESEARCH_PROMPTS.SERP(
                topic,
                section,
                breadth,
                gaps
            );

            const response = await this.getChatCompletion(prompt);
            
            this.debug('Search queries response:', response);

            const queries = JSON.parse(response);
            
            this.debug('Parsed queries:', queries);
            return queries;

        } catch (error) {
            this.debug('Error generating search queries:', error);
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
                maxResults,
                isRetry
            });

            const results = await provider.search(query, isRetry ? maxResults + 1 : maxResults);
            
            // Check if all results have empty content
            const hasContent = results.some(r => r.content);
            if (!hasContent && !isRetry) {
                this.debug('All results have empty content, retrying with increased maxResults');
                return this.search(query, maxResults, true);
            }

            this.debug('Search results:', results);
            return results;

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

    async getLearnings(section: string, searchResults: SearchResult[]): Promise<string[]> {
        try {
            const allLearnings: string[] = [];
            
            for (const result of searchResults) {
                const text = result.content;
                if (!text) {
                    this.debug('Skipping result with no content:', result.url);
                    continue;
                }

                // Split content into chunks
                const chunks = this.splitIntoChunks(text);
                this.debug(`Split content into ${chunks.length} chunks`);

                for (const chunk of chunks) {
                    this.debug('Processing chunk:', {
                        section,
                        url: result.url,
                        chunkLength: chunk.length,
                    });

                    const prompt = RESEARCH_PROMPTS.LEARNING(
                        section,
                        result.url,
                        chunk
                    );

                    const response = await this.getChatCompletion(prompt);
                    const learnings = JSON.parse(response);
                    allLearnings.push(...learnings);
                }
            }

            // Store learnings for this section
            const existingSection = this.sectionLearnings.find(sl => sl.section === section);
            if (existingSection) {
                existingSection.learnings.push(...allLearnings);
            } else {
                this.sectionLearnings.push({
                    section,
                    learnings: allLearnings
                });
            }

            this.debug('Updated sectionLearnings:', this.sectionLearnings);
            return allLearnings;
        } catch (error) {
            this.debug('Error getting learnings:', error);
            throw new Error(`Failed to get learnings: ${(error as Error).message}`);
        }
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
            const provider = ProviderFactory.createLLMProvider(this.settings);
            if (!provider) {
                throw new Error('No LLM provider configured');
            }

            const learnings = this.getLearningsForSection(section);
            if (!learnings.length) {
                this.debug('No learnings found for section:', section);
                return [];
            }

            const prompt = RESEARCH_PROMPTS.GAP(section, learnings);
            const response = await this.getChatCompletion(prompt);
            
            this.debug('Gaps response:', response);
            return JSON.parse(response);

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

            const prompt = RESEARCH_PROMPTS.SYNTHESIZE(section, learnings);
            const response = await this.getChatCompletion(prompt);
            
            this.debug('Synthesis response:', response);
            return response;

        } catch (error) {
            this.debug('Error synthesizing section:', error);
            throw new Error(`Failed to synthesize section: ${(error as Error).message}`);
        }
    }

    getSectionContent(section: string): string {
        const sectionData = this.sectionContent.find(sc => sc.section === section);
        return sectionData?.content || '';
    }

    async getConclusion(topic: string): Promise<string> {
        try {
            // Get all learnings from all sections
            const allLearnings = this.sectionLearnings.flatMap(sl => sl.learnings);
            
            const prompt = RESEARCH_PROMPTS.CONCLUSION(topic, allLearnings);
            const response = await this.getChatCompletion(prompt);
            
            this.debug('Conclusion response:', response);
            return response;

        } catch (error) {
            this.debug('Error generating conclusion:', error);
            throw new Error(`Failed to generate conclusion: ${(error as Error).message}`);
        }
    }

    async saveResearchToFile(researchData: ResearchData): Promise<void> {
        try {
            // Create file content
            let content = '';

            // Add title as H1
            content += `# ${researchData.title}\n\n`;

            // Add introduction
            content += `${JSON.parse(researchData.introduction)[0]}\n\n`;

            // Add each section's content
            for (const section of researchData.sections) {
                const sectionContent = this.getSectionContent(section);
                content += `${JSON.parse(sectionContent)[0]}\n\n`;
            }

            // Add conclusion
            content += `${JSON.parse(researchData.conclusion)[0]}\n`;

            // Create folder if it doesn't exist
            const folderPath = 'Deep Research';
            if (!await this.app.vault.adapter.exists(folderPath)) {
                await this.app.vault.createFolder(folderPath);
            }

            // Create file with sanitized title
            const fileName = `${folderPath}/${this.sanitizeFileName(researchData.title)}.md`;
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
} 