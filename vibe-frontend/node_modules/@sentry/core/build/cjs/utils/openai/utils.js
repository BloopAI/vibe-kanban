Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const genAiAttributes = require('../gen-ai-attributes.js');
const constants = require('./constants.js');

/**
 * Maps OpenAI method paths to Sentry operation names
 */
function getOperationName(methodPath) {
  if (methodPath.includes('chat.completions')) {
    return genAiAttributes.OPENAI_OPERATIONS.CHAT;
  }
  if (methodPath.includes('responses')) {
    // The responses API is also a chat operation
    return genAiAttributes.OPENAI_OPERATIONS.CHAT;
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
  return constants.INSTRUMENTED_METHODS.includes(methodPath );
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

exports.buildMethodPath = buildMethodPath;
exports.getOperationName = getOperationName;
exports.getSpanOperation = getSpanOperation;
exports.isChatCompletionResponse = isChatCompletionResponse;
exports.isResponsesApiResponse = isResponsesApiResponse;
exports.shouldInstrument = shouldInstrument;
//# sourceMappingURL=utils.js.map
