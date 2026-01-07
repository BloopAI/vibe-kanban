/**
 * OpenAI Integration Telemetry Attributes
 * Based on OpenTelemetry Semantic Conventions for Generative AI
 * @see https://opentelemetry.io/docs/specs/semconv/gen-ai/
 */
/**
 * The Generative AI system being used
 * For OpenAI, this should always be "openai"
 */
export declare const GEN_AI_SYSTEM_ATTRIBUTE = "gen_ai.system";
/**
 * The name of the model as requested
 * Examples: "gpt-4", "gpt-3.5-turbo"
 */
export declare const GEN_AI_REQUEST_MODEL_ATTRIBUTE = "gen_ai.request.model";
/**
 * Whether streaming was enabled for the request
 */
export declare const GEN_AI_REQUEST_STREAM_ATTRIBUTE = "gen_ai.request.stream";
/**
 * The temperature setting for the model request
 */
export declare const GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE = "gen_ai.request.temperature";
/**
 * The maximum number of tokens requested
 */
export declare const GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE = "gen_ai.request.max_tokens";
/**
 * The frequency penalty setting for the model request
 */
export declare const GEN_AI_REQUEST_FREQUENCY_PENALTY_ATTRIBUTE = "gen_ai.request.frequency_penalty";
/**
 * The presence penalty setting for the model request
 */
export declare const GEN_AI_REQUEST_PRESENCE_PENALTY_ATTRIBUTE = "gen_ai.request.presence_penalty";
/**
 * The top_p (nucleus sampling) setting for the model request
 */
export declare const GEN_AI_REQUEST_TOP_P_ATTRIBUTE = "gen_ai.request.top_p";
/**
 * The top_k setting for the model request
 */
export declare const GEN_AI_REQUEST_TOP_K_ATTRIBUTE = "gen_ai.request.top_k";
/**
 * Stop sequences for the model request
 */
export declare const GEN_AI_REQUEST_STOP_SEQUENCES_ATTRIBUTE = "gen_ai.request.stop_sequences";
/**
 * Array of reasons why the model stopped generating tokens
 */
export declare const GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE = "gen_ai.response.finish_reasons";
/**
 * The name of the model that generated the response
 */
export declare const GEN_AI_RESPONSE_MODEL_ATTRIBUTE = "gen_ai.response.model";
/**
 * The unique identifier for the response
 */
export declare const GEN_AI_RESPONSE_ID_ATTRIBUTE = "gen_ai.response.id";
/**
 * The number of tokens used in the prompt
 */
export declare const GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE = "gen_ai.usage.input_tokens";
/**
 * The number of tokens used in the response
 */
export declare const GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE = "gen_ai.usage.output_tokens";
/**
 * The total number of tokens used (input + output)
 */
export declare const GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE = "gen_ai.usage.total_tokens";
/**
 * The operation name for OpenAI API calls
 */
export declare const GEN_AI_OPERATION_NAME_ATTRIBUTE = "gen_ai.operation.name";
/**
 * The prompt messages sent to OpenAI (stringified JSON)
 * Only recorded when recordInputs is enabled
 */
export declare const GEN_AI_REQUEST_MESSAGES_ATTRIBUTE = "gen_ai.request.messages";
/**
 * The response text from OpenAI (stringified JSON array)
 * Only recorded when recordOutputs is enabled
 */
export declare const GEN_AI_RESPONSE_TEXT_ATTRIBUTE = "gen_ai.response.text";
/**
 * The response ID from OpenAI
 */
export declare const OPENAI_RESPONSE_ID_ATTRIBUTE = "openai.response.id";
/**
 * The response model from OpenAI
 */
export declare const OPENAI_RESPONSE_MODEL_ATTRIBUTE = "openai.response.model";
/**
 * The response timestamp from OpenAI (ISO string)
 */
export declare const OPENAI_RESPONSE_TIMESTAMP_ATTRIBUTE = "openai.response.timestamp";
/**
 * The number of completion tokens used (OpenAI specific)
 */
export declare const OPENAI_USAGE_COMPLETION_TOKENS_ATTRIBUTE = "openai.usage.completion_tokens";
/**
 * The number of prompt tokens used (OpenAI specific)
 */
export declare const OPENAI_USAGE_PROMPT_TOKENS_ATTRIBUTE = "openai.usage.prompt_tokens";
/**
 * OpenAI API operations
 */
export declare const OPENAI_OPERATIONS: {
    readonly CHAT: "chat";
};
//# sourceMappingURL=gen-ai-attributes.d.ts.map