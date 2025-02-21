export interface SearchResult {
    title: string;
    url: string;
    snippet: string;
    content?: string;
    score?: number;
}

export interface WebSearchProvider {
    name: string;
    search(query: string, maxResults: number): Promise<SearchResult[]>;
    testConnection(): Promise<boolean>;
} 