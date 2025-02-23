import { LLMProvider } from './LLMProvider';
import { requestUrl } from 'obsidian';
import { DeepestSettings } from '../settings';
import { RateLimiter } from '../utils/RateLimiter';

export class OpenRouterProvider implements LLMProvider {
    name = 'OpenRouter';
    private apiKey: string;
    private baseUrl = 'https://openrouter.ai/api/v1';
    private rateLimiter: RateLimiter;

    constructor(apiKey: string, private settings: DeepestSettings) {
        this.apiKey = apiKey;
        // Always enable rate limiting for cloud providers
        this.rateLimiter = new RateLimiter(settings.llmRateLimit);
    }

    async getModels(): Promise<string[]> {
        try {
            const response = await requestUrl({
                url: `${this.baseUrl}/models`,
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'HTTP-Referer': 'https://github.com/your-username/obsidian-deepest',
                    'X-Title': 'Obsidian Deepest'
                }
            });

            if (response.status !== 200) {
                throw new Error(`Failed to fetch models: ${response.status}`);
            }

            return response.json.data.map((model: any) => model.id);
        } catch (error) {
            console.error('Error fetching OpenRouter models:', error);
            throw error;
        }
    }

    async chatCompletion(prompt: string, systemPrompt: string, options?: {
        maxTokens?: number;
        temperature?: number;
    }): Promise<string> {
        // Always rate limit cloud providers
        await this.rateLimiter.waitForNext();

        try {
            // Check API key first
            if (!this.apiKey) {
                throw new Error('OpenRouter API key not configured. Please add your API key in settings.');
            }

            const response = await requestUrl({
                url: `${this.baseUrl}/chat/completions`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`,
                    'HTTP-Referer': 'https://github.com/your-username/obsidian-deepest',
                    'X-Title': 'Obsidian Deepest'
                },
                body: JSON.stringify({
                    model: this.settings.selectedModel,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: prompt }
                    ],
                    max_tokens: options?.maxTokens || this.settings.maxTokens,
                    temperature: options?.temperature || this.settings.temperature
                })
            });

            if (response.status === 401) {
                throw new Error('Invalid or expired OpenRouter API key. Please check your API key in settings.');
            }

            if (response.status === 402) {
                throw new Error('OpenRouter API credit limit reached. Please check your account balance at openrouter.ai.');
            }

            if (response.status !== 200) {
                throw new Error(`OpenRouter request failed (${response.status}): ${response.text}`);
            }

            return response.json.choices[0].message.content;
        } catch (error) {
            const message = (error as Error).message;
            if (message.includes('API key') || message.includes('credit limit')) {
                // Re-throw authentication and billing errors as-is
                throw error;
            }
            // Wrap other errors
            throw new Error(`OpenRouter request failed: ${message}`);
        }
    }

    async testConnection(): Promise<boolean> {
        try {
            const models = await this.getModels();
            return models.length > 0;
        } catch (error) {
            console.error('OpenRouter connection test failed:', error);
            return false;
        }
    }
} 