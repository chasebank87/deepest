export interface LLMProvider {
    name: string;
    chatCompletion(prompt: string, systemPrompt: string, options?: {
        maxTokens?: number;
        temperature?: number;
    }): Promise<string>;
    testConnection(): Promise<boolean>;
    getModels(): Promise<string[]>;
}

export interface CompletionOptions {
    maxTokens: number;
    temperature: number;
    model: string;
} 