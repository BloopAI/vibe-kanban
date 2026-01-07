/**
 * Request-related types
 */
export type Headers = Record<string, string>;
export interface RequestResponse {
    statusCode: number;
    text?: string;
    json?: any;
}
export type RequestCallback = (response: RequestResponse) => void;
//# sourceMappingURL=request.d.ts.map