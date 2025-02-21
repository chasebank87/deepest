import { LLMProvider } from './LLMProvider';
import { requestUrl } from 'obsidian';
import { DeepestSettings } from '../settings';

export class OpenRouterProvider implements LLMProvider {
    name = 'OpenRouter';
    private apiKey: string;
    private baseUrl = 'https://openrouter.ai/api/v1';

    constructor(apiKey: string, private settings: DeepestSettings) {
        this.apiKey = apiKey;
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
        try {
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

            if (response.status !== 200) {
                throw new Error(`Chat completion failed: ${response.status}`);
            }

            return response.json.choices[0].message.content;
        } catch (error) {
            console.error('Error getting chat completion from OpenRouter:', error);
            throw error;
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