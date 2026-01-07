import type { InstrumentedMethod, OpenAiChatCompletionObject, OpenAIResponseObject } from './types';
/**
 * Maps OpenAI method paths to Sentry operation names
 */
export declare function getOperationName(methodPath: string): string;
/**
 * Get the span operation for OpenAI methods
 * Following Sentry's convention: "gen_ai.{operation_name}"
 */
export declare function getSpanOperation(methodPath: string): string;
/**
 * Check if a method path should be instrumented
 */
export declare function shouldInstrument(methodPath: string): methodPath is InstrumentedMethod;
/**
 * Build method path from current traversal
 */
export declare function buildMethodPath(currentPath: string, prop: string): string;
/**
 * Check if response is a Chat Completion object
 */
export declare function isChatCompletionResponse(response: unknown): response is OpenAiChatCompletionObject;
/**
 * Check if response is a Responses API object
 */
export declare function isResponsesApiResponse(response: unknown): response is OpenAIResponseObject;
//# sourceMappingURL=utils.d.ts.map