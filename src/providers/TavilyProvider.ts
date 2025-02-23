import { WebSearchProvider, SearchResult } from './WebSearchProvider';
import { requestUrl } from 'obsidian';
import { RateLimiter } from '../utils/RateLimiter';
import { DeepestSettings } from '../settings';

export class TavilyProvider implements WebSearchProvider {
    name = 'Tavily';
    private apiKey: string;
    private rateLimiter: RateLimiter;

    constructor(apiKey: string, private settings: DeepestSettings) {
        this.apiKey = apiKey;
        // Always enable rate limiting for cloud providers
        this.rateLimiter = new RateLimiter(settings.webSearchRateLimit);
    }

    async search(query: string, maxResults: number): Promise<SearchResult[]> {
        // Always rate limit cloud providers
        await this.rateLimiter.waitForNext();
        
        try {
            const response = await requestUrl({
                url: 'https://api.tavily.com/search',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    query: query,
                    search_depth: 'advanced',
                    include_answer: false,
                    include_raw_content: true,
                    include_images: false,
                    max_results: maxResults
                })
            });

            if (response.status !== 200) {
                throw new Error(`Search failed: ${response.status}`);
            }

            const results = response.json.results;
            return results.map((result: any) => ({
                title: result.title,
                url: result.url,
                content: result.raw_content,
                score: result.score
            }));
        } catch (error) {
            console.error('Error searching with Tavily:', error);
            throw error;
        }
    }

    async testConnection(): Promise<boolean> {
        try {
            const response = await requestUrl({
                url: 'https://api.tavily.com/search',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    query: 'test',
                    search_depth: 'basic',
                    include_answer: false,
                    include_raw_content: false,
                    include_images: false
                })
            });

            return response.status === 200;
        } catch (error) {
            console.error('Tavily connection test failed:', error);
            return false;
        }
    }
} 