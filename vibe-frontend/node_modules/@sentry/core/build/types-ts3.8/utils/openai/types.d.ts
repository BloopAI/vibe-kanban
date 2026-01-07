import { INSTRUMENTED_METHODS } from './constants';
/**
 * Attribute values may be any non-nullish primitive value except an object.
 *
 * null or undefined attribute values are invalid and will result in undefined behavior.
 */
export type AttributeValue = string | number | boolean | Array<null | undefined | string> | Array<null | undefined | number> | Array<null | undefined | boolean>;
export interface OpenAiOptions {
    /**
     * Enable or disable input recording. Enabled if `sendDefaultPii` is `true`
     */
    recordInputs?: boolean;
    /**
     * Enable or disable output recording. Enabled if `sendDefaultPii` is `true`
     */
    recordOutputs?: boolean;
}
export interface OpenAiClient {
    responses?: {
        create: (...args: unknown[]) => Promise<unknown>;
    };
    chat?: {
        completions?: {
            create: (...args: unknown[]) => Promise<unknown>;
        };
    };
}
/**
 * @see https://platform.openai.com/docs/api-reference/chat/object
 */
export interface OpenAiChatCompletionObject {
    id: string;
    object: 'chat.completion';
    created: number;
    model: string;
    choices: Array<{
        index: number;
        message: {
            role: 'assistant' | 'user' | 'system' | string;
            content: string | null;
            refusal?: string | null;
            annotations?: Array<unknown>;
        };
        logprobs?: unknown | null;
        finish_reason: string | null;
    }>;
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
        prompt_tokens_details?: {
            cached_tokens?: number;
            audio_tokens?: number;
        };
        completion_tokens_details?: {
            reasoning_tokens?: number;
            audio_tokens?: number;
            accepted_prediction_tokens?: number;
            rejected_prediction_tokens?: number;
        };
    };
    service_tier?: string;
    system_fingerprint?: string;
}
/**
 * @see https://platform.openai.com/docs/api-reference/responses/object
 */
export interface OpenAIResponseObject {
    id: string;
    object: 'response';
    created_at: number;
    status: 'in_progress' | 'completed' | 'failed' | 'cancelled';
    error: string | null;
    incomplete_details: unknown | null;
    instructions: unknown | null;
    max_output_tokens: number | null;
    model: string;
    output: Array<{
        type: 'message';
        id: string;
        status: 'completed' | string;
        role: 'assistant' | string;
        content: Array<{
            type: 'output_text';
            text: string;
            annotations: Array<unknown>;
        }>;
    }>;
    output_text: string;
    parallel_tool_calls: boolean;
    previous_response_id: string | null;
    reasoning: {
        effort: string | null;
        summary: string | null;
    };
    store: boolean;
    temperature: number;
    text: {
        format: {
            type: 'text' | string;
        };
    };
    tool_choice: 'auto' | string;
    tools: Array<unknown>;
    top_p: number;
    truncation: 'disabled' | string;
    usage: {
        input_tokens: number;
        input_tokens_details?: {
            cached_tokens?: number;
        };
        output_tokens: number;
        output_tokens_details?: {
            reasoning_tokens?: number;
        };
        total_tokens: number;
    };
    user: string | null;
    metadata: Record<string, unknown>;
}
export type OpenAiResponse = OpenAiChatCompletionObject | OpenAIResponseObject;
/**
 * OpenAI Integration interface for type safety
 */
export interface OpenAiIntegration {
    name: string;
    options: OpenAiOptions;
}
export type InstrumentedMethod = (typeof INSTRUMENTED_METHODS)[number];
//# sourceMappingURL=types.d.ts.map
