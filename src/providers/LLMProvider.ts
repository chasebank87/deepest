export interface LLMProvider {
    name: string;
    getModels(): Promise<string[]>;
    chatCompletion(prompt: string): Promise<string>;
    testConnection(): Promise<boolean>;
}

export interface CompletionOptions {
    maxTokens: number;
    temperature: number;
    model: string;
} 