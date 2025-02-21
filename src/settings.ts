export interface DeepestSettings {
    // API Keys
    openaiApiKey: string;
    openrouterApiKey: string;
    perplexityApiKey: string;
    tavilyApiKey: string;

    // Self-hosted URLs
    lmstudioUrl: string;
    ollamaUrl: string;

    // Model settings
    maxTokens: number;
    temperature: number;

    // Rate limits
    openaiRateLimit: number;
    openrouterRateLimit: number;
    perplexityRateLimit: number;
    tavilyRateLimit: number;

    // Provider selection
    selectedLLMProvider: 'lmstudio' | 'openrouter';
    selectedWebSearchProvider: string;

    // Output settings
    outputFolder: string;

    // Model selection
    selectedModel: string;

    // Debug mode
    debugMode: boolean;

    // Research settings
    breadth: number;
    depth: number;
}

export const DEFAULT_SETTINGS: DeepestSettings = {
    openaiApiKey: '',
    openrouterApiKey: '',
    perplexityApiKey: '',
    tavilyApiKey: '',
    lmstudioUrl: 'http://localhost:1234',
    ollamaUrl: 'http://localhost:11434',
    maxTokens: 1000,
    temperature: 0.7,
    openaiRateLimit: 3,
    openrouterRateLimit: 5,
    perplexityRateLimit: 3,
    tavilyRateLimit: 5,
    selectedLLMProvider: 'openrouter',
    selectedWebSearchProvider: 'perplexity',
    outputFolder: 'Deepest Reports',
    selectedModel: '',
    debugMode: false,
    breadth: 5,
    depth: 3,
}; 