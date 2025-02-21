import { SYSTEM_PROMPTS, CHAT_PROMPTS, formatPrompt } from './prompts';

// Example usage:
const systemPrompt = SYSTEM_PROMPTS.DEFAULT;
const analysisPrompt = CHAT_PROMPTS.ANALYZE_DOCUMENT(documentContent);
const searchPrompt = CHAT_PROMPTS.SEARCH_QUERY('quantum computing'); 