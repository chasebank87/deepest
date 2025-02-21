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

    async chatCompletion(prompt: string): Promise<string> {
        try {
            const response = await requestUrl({
                url: `${this.baseUrl}/v1/chat/completions`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: this.settings.selectedModel,
                    messages: [
                        { role: 'user', content: prompt }
                    ],
                    response_format: {
                        type: "json_schema",
                        json_schema: {
                            name: "research_questions",
                            schema: {
                                type: "object",
                                properties: {
                                    data: {
                                        type: "object",
                                        properties: {
                                            think: { type: "string" },
                                            output: {
                                                type: "array",
                                                items: { type: "string" }
                                            }
                                        },
                                        required: ["output"]
                                    }
                                },
                                required: ["data"]
                            }
                        }
                    },
                    temperature: this.settings.temperature,
                    max_tokens: this.settings.maxTokens,
                    stream: false
                })
            });

            if (response.status !== 200) {
                throw new Error(`Chat completion failed: ${response.status}`);
            }

            const result = response.json.choices[0].message.content;
            const parsed = JSON.parse(result);
            return JSON.stringify(parsed.data.output);
        } catch (error) {
            console.error('Error getting chat completion from LM Studio:', error);
            throw error;
        }
    }

    async testConnection(): Promise<boolean> {
        try {
            const models = await this.getModels();
            return models.length > 0;
        } catch (error) {
            console.error('LM Studio connection test failed:', error);
            return false;
        }
    }
} 