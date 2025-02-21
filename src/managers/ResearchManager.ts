import { Notice } from 'obsidian';
import { CHAT_PROMPTS } from '../prompts';
import { ProviderFactory } from '../providers/ProviderFactory';
import { DeepestSettings } from '../settings';
import { RESEARCH_PROMPTS } from '../prompts';
import { ResearchView } from '../views/ResearchView';
import { ResearchAnswer, ResearchData, ProgressUpdate, SectionLearnings } from '../types';
import { SearchResult } from '../providers/WebSearchProvider';

export interface ResearchAnswer {
    question: string;
    answer: string;
}

export interface ResearchData {
    topic: string;
    title: string;
    introduction: string;
    sections: string[];
    depth: number;
}

interface ProgressStep {
    phase: string;
    current: number;
    total: number;
    detail?: string;
}

export interface ProgressUpdate {
    step: ProgressStep;
    totalProgress: number; // 0-100
}

export class ResearchManager {
    private view: ResearchView;
    private sectionLearnings: SectionLearnings[] = [];

    constructor(private settings: DeepestSettings, view: ResearchView) {
        this.view = view;
    }

    private debug(message: string, data?: any) {
        if (this.settings.debugMode) {
            console.log(`[Deepest Debug] ${message}`, data || '');
        }
    }

    async getFeedbackQuestions(topic: string): Promise<string[]> {
        try {
            const provider = ProviderFactory.createLLMProvider(this.settings);
            if (!provider) {
                throw new Error('No LLM provider configured');
            }

            const prompt = CHAT_PROMPTS.FEEDBACK(topic);
            const response = await provider.chatCompletion(prompt);
            
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

            const response = await provider.chatCompletion(prompt);
            
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
                // Clear previous section's learnings
                this.sectionLearnings = this.sectionLearnings.filter(sl => sl.section !== sections[i]);
                
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
            }
            this.view.updateProgress(this.createProgressUpdate('Generating Search Queries', sections.length, sections.length));

            const researchData: ResearchData = {
                topic,
                title,
                introduction,
                sections,
                depth
            };

            this.debug('Research data prepared:', researchData);

            // Will handle:
            // 5. Research each section
            // 6. Generate content
            // 7. Format and structure the report
            // 8. Handle citations and sources
            // 9. Create final document

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

            const response = await provider.chatCompletion(prompt);
            
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

            const response = await provider.chatCompletion(prompt);
            
            this.debug('Introduction response:', response);

            // Response should be plain text
            return response.trim();

        } catch (error) {
            this.debug('Error generating introduction:', error);
            throw new Error(`Failed to generate introduction: ${(error as Error).message}`);
        }
    }

    private calculateTotalSteps(breadth: number, depth: number): number {
        const initialSteps = 3; // sections, title, intro
        const conclusionSteps = 1;
        const sectionsCount = breadth;
        const queriesPerSection = breadth;
        const depthSteps = depth;
        
        // For each section:
        // 1. SERP queries generation (1 step)
        // 2. Web searches (breadth steps)
        // 3. Initial learning (breadth steps)
        // 4. Depth expansions (depth * breadth steps)
        const stepsPerSection = 1 + queriesPerSection + queriesPerSection + (queriesPerSection * depthSteps);
        
        return initialSteps + (sectionsCount * stepsPerSection) + conclusionSteps;
    }

    private createProgressUpdate(phase: string, current: number, total: number, detail?: string): ProgressUpdate {
        const totalSteps = this.calculateTotalSteps(this.settings.breadth, this.settings.depth);
        
        // Calculate current overall step based on phase
        let currentOverallStep = 0;
        switch (phase) {
            case 'Generating Sections':
                currentOverallStep = 1;
                break;
            case 'Generating Title':
                currentOverallStep = 2;
                break;
            case 'Generating Introduction':
                currentOverallStep = 3;
                break;
            case 'Generating Search Queries':
                currentOverallStep = 4;
                break;
            case 'Searching Web':
                currentOverallStep = 5;
                break;
            case 'Extracting Learnings':
                currentOverallStep = 6;
                break;
            // Add more cases as we implement them
        }
        
        return {
            step: {
                phase,
                current,
                total,
                detail
            },
            totalProgress: (currentOverallStep / totalSteps) * 100
        };
    }

    async getQueries(topic: string, section: string, breadth: number): Promise<string[]> {
        try {
            const provider = ProviderFactory.createLLMProvider(this.settings);
            if (!provider) {
                throw new Error('No LLM provider configured');
            }
            
            this.debug('Generating search queries for section:', {
                topic,
                section,
                breadth
            });

            const prompt = RESEARCH_PROMPTS.SERP(
                topic,
                section,
                breadth
            );

            const response = await provider.chatCompletion(prompt);
            
            this.debug('Search queries response:', response);

            const queries = JSON.parse(response);
            
            this.debug('Parsed queries:', queries);
            return queries;

        } catch (error) {
            this.debug('Error generating search queries:', error);
            throw new Error(`Failed to generate search queries: ${(error as Error).message}`);
        }
    }

    async search(query: string, maxResults: number): Promise<SearchResult[]> {
        try {
            const provider = ProviderFactory.createWebSearchProvider(this.settings);
            if (!provider) {
                throw new Error('No web search provider configured');
            }
            
            this.debug('Searching with query:', {
                query,
                maxResults
            });

            const results = await provider.search(query, maxResults);
            
            this.debug('Search results:', results);
            return results;

        } catch (error) {
            this.debug('Error in web search:', error);
            throw new Error(`Failed to perform web search: ${(error as Error).message}`);
        }
    }

    async getLearnings(section: string, searchResults: SearchResult[]): Promise<string[]> {
        try {
            const provider = ProviderFactory.createLLMProvider(this.settings);
            if (!provider) {
                throw new Error('No LLM provider configured');
            }

            const allLearnings: string[] = [];
            
            for (const result of searchResults) {
                const text = result.content;
                if (!text) {
                    this.debug('Skipping result with no content:', result.url);
                    continue;
                }
                
                this.debug('Extracting learnings from:', {
                    section,
                    url: result.url,
                    textLength: text.length,
                });

                const prompt = RESEARCH_PROMPTS.LEARNING(
                    section,
                    result.url,
                    text
                );

                const response = await provider.chatCompletion(prompt);
                this.debug('Learnings response:', response);

                const learnings = JSON.parse(response);
                allLearnings.push(...learnings);
            }

            // Store learnings for this section
            this.sectionLearnings.push({
                section,
                learnings: allLearnings
            });

            return allLearnings;

        } catch (error) {
            this.debug('Error getting learnings:', error);
            throw new Error(`Failed to get learnings: ${(error as Error).message}`);
        }
    }
} 