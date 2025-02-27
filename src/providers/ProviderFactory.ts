import { LLMProvider } from './LLMProvider';
import { WebSearchProvider } from './WebSearchProvider';
import { LMStudioProvider } from './LMStudioProvider';
import { OpenRouterProvider } from './OpenRouterProvider';
import { TavilyProvider } from './TavilyProvider';
import { DeepestSettings } from '../settings';

export class ProviderFactory {
    static createLLMProvider(settings: DeepestSettings): LLMProvider | null {
        switch (settings.selectedLLMProvider) {
            case 'lmstudio':
                return new LMStudioProvider(settings.lmstudioUrl, settings);
            case 'openrouter':
                return new OpenRouterProvider(settings.openrouterApiKey, settings);
            // Add other providers here
            default:
                return null;
        }
    }

    static createWebSearchProvider(settings: DeepestSettings): WebSearchProvider | null {
        switch (settings.selectedWebSearchProvider) {
            case 'tavily':
                return new TavilyProvider(settings.tavilyApiKey, settings);
            case 'perplexity':
                // Add Perplexity provider here
                return null;
            default:
                return null;
        }
    }
} 