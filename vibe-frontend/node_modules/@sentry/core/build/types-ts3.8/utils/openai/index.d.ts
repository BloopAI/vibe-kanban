import { OpenAiClient, OpenAiOptions } from './types';
/**
 * Instrument an OpenAI client with Sentry tracing
 * Can be used across Node.js, Cloudflare Workers, and Vercel Edge
 */
export declare function instrumentOpenAiClient(client: OpenAiClient, options?: OpenAiOptions): OpenAiClient;
//# sourceMappingURL=index.d.ts.map
