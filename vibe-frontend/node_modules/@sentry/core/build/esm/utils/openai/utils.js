import { OPENAI_OPERATIONS } from '../gen-ai-attributes.js';
import { INSTRUMENTED_METHODS } from './constants.js';

/**
 * Maps OpenAI method paths to Sentry operation names
 */
function getOperationName(methodPath) {
  if (methodPath.includes('chat.completions')) {
    return OPENAI_OPERATIONS.CHAT;
  }
  if (methodPath.includes('responses')) {
    // The responses API is also a chat operation
    return OPENAI_OPERATIONS.CHAT;
  }
  return methodPath.split('.').pop() || 'unknown';
}

/**
 * Get the span operation for OpenAI methods
 * Following Sentry's convention: "gen_ai.{operation_name}"
 */
function getSpanOperation(methodPath) {
  return `gen_ai.${getOperationName(methodPath)}`;
}

/**
 * Check if a method path should be instrumented
 */
function shouldInstrument(methodPath) {
  return INSTRUMENTED_METHODS.includes(methodPath );
}

/**
 * Build method path from current traversal
 */
function buildMethodPath(currentPath, prop) {
  return currentPath ? `${currentPath}.${prop}` : prop;
}

/**
 * Check if response is a Chat Completion object
 */
function isChatCompletionResponse(response) {
  return (
    response !== null &&
    typeof response === 'object' &&
    'object' in response &&
    (response ).object === 'chat.completion'
  );
}

/**
 * Check if response is a Responses API object
 */
function isResponsesApiResponse(response) {
  return (
    response !== null &&
    typeof response === 'object' &&
    'object' in response &&
    (response ).object === 'response'
  );
}

export { buildMethodPath, getOperationName, getSpanOperation, isChatCompletionResponse, isResponsesApiResponse, shouldInstrument };
//# sourceMappingURL=utils.js.map
