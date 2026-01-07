/**
 * Request-related types
 */

export type Headers = Record<string, string>

// Minimal class to allow interop between different request methods (xhr / fetch)
export interface RequestResponse {
    statusCode: number
    text?: string
    json?: any
}

export type RequestCallback = (response: RequestResponse) => void
