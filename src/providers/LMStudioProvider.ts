import { LLMProvider } from './LLMProvider';
import { RequestUrlResponse, requestUrl } from 'obsidian';
import { DeepestSettings } from '../settings';

export class LMStudioProvider implements LLMProvider {
    name = 'LM Studio';
    private baseUrl: string;

    constructor(baseUrl: string, private settings: DeepestSettings) {
        this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash if present
    }

    async getModels(): Promise<string[]> {
        try {
            const response = await requestUrl({
                url: `${this.baseUrl}/v1/models`,
                method: 'GET',
            });

            if (response.status !== 200) {
                throw new Error(`Failed to fetch models: ${response.status}`);
            }

            const data = response.json.data;
            return data.map((model: any) => model.id);
        } catch (error) {
            console.error('Error fetching LM Studio models:', error);
            throw error;
        }
    }

    async testConnection(): Promise<boolean> {
        try {
            const response = await requestUrl({
                url: `${this.baseUrl}/v1/models`,
                method: 'GET'
            });
            
            if (response.status !== 200) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return true;
        } catch (error) {
            throw new Error(`LMStudio server not accessible: ${(error as Error).message}`);
        }
    }

    async chatCompletion(prompt: string, systemPrompt: string, options?: {
        maxTokens?: number;
        temperature?: number;
    }): Promise<string> {
        try {
            // First verify server is accessible
            await this.testConnection();

            const response = await requestUrl({
                url: `${this.baseUrl}/v1/chat/completions`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messages: [
                        {
                            role: 'system',
                            content: systemPrompt
                        },
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],
                    max_tokens: options?.maxTokens || this.settings.maxTokens,
                    temperature: options?.temperature || this.settings.temperature,
                    stream: false
                })
            });

            if (response.status !== 200) {
                throw new Error(`Request failed, status ${response.status}. Please ensure LMStudio server is running at ${this.baseUrl}`);
            }

            const data = response.json;
            return data.choices[0].message.content;
        } catch (error) {
            throw new Error(`LMStudio request failed: ${(error as Error).message}`);
        }
    }
} 