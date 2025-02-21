import { LLMProvider } from './LLMProvider';
import { WebSearchProvider } from './WebSearchProvider';
import { LMStudioProvider } from './LMStudioProvider';
import { TavilyProvider } from './TavilyProvider';
import { DeepestSettings } from '../settings';

export class ProviderFactory {
    static createLLMProvider(settings: DeepestSettings): LLMProvider | null {
        switch (settings.selectedLLMProvider) {
            case 'lmstudio':
                return new LMStudioProvider(settings.lmstudioUrl, settings);
            // Add other providers here
            default:
                return null;
        }
    }

    static createWebSearchProvider(settings: DeepestSettings): WebSearchProvider | null {
        switch (settings.selectedWebSearchProvider) {
            case 'tavily':
                return new TavilyProvider(settings.tavilyApiKey);
            // Add Perplexity provider here
            default:
                return null;
        }
    }
} 