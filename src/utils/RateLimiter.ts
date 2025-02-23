export class RateLimiter {
    private lastRequest: number = 0;
    private requestCount: number = 0;
    private readonly interval: number = 60000; // 1 minute in milliseconds

    constructor(private requestsPerMinute: number) {}

    async waitForNext(): Promise<void> {
        // Skip rate limiting if set to 0 (unlimited)
        if (this.requestsPerMinute === 0) {
            return;
        }
        
        const now = Date.now();
        
        // Reset counter if interval has passed
        if (now - this.lastRequest >= this.interval) {
            this.requestCount = 0;
            this.lastRequest = now;
            return;
        }

        // If we've hit the limit, wait until next interval
        if (this.requestCount >= this.requestsPerMinute) {
            const waitTime = this.interval - (now - this.lastRequest);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            this.requestCount = 0;
            this.lastRequest = Date.now();
            return;
        }

        this.requestCount++;
        this.lastRequest = now;
    }
} 