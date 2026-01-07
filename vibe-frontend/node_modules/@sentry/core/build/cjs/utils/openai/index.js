Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const currentScopes = require('../../currentScopes.js');
const exports$1 = require('../../exports.js');
const trace = require('../../tracing/trace.js');
const genAiAttributes = require('../gen-ai-attributes.js');
const constants = require('./constants.js');
const utils = require('./utils.js');

/**
 * Extract request attributes from method arguments
 */
function extractRequestAttributes(args, methodPath) {
  const attributes = {
    [genAiAttributes.GEN_AI_SYSTEM_ATTRIBUTE]: 'openai',
    [genAiAttributes.GEN_AI_OPERATION_NAME_ATTRIBUTE]: utils.getOperationName(methodPath),
  };

  if (args.length > 0 && typeof args[0] === 'object' && args[0] !== null) {
    const params = args[0] ;

    attributes[genAiAttributes.GEN_AI_REQUEST_MODEL_ATTRIBUTE] = params.model ?? 'unknown';
    if ('temperature' in params) attributes[genAiAttributes.GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE] = params.temperature;
    if ('top_p' in params) attributes[genAiAttributes.GEN_AI_REQUEST_TOP_P_ATTRIBUTE] = params.top_p;
    if ('frequency_penalty' in params)
      attributes[genAiAttributes.GEN_AI_REQUEST_FREQUENCY_PENALTY_ATTRIBUTE] = params.frequency_penalty;
    if ('presence_penalty' in params) attributes[genAiAttributes.GEN_AI_REQUEST_PRESENCE_PENALTY_ATTRIBUTE] = params.presence_penalty;
  } else {
    attributes[genAiAttributes.GEN_AI_REQUEST_MODEL_ATTRIBUTE] = 'unknown';
  }

  return attributes;
}

/**
 * Helper function to set token usage attributes
 */
function setTokenUsageAttributes(
  span,
  promptTokens,
  completionTokens,
  totalTokens,
) {
  if (promptTokens !== undefined) {
    span.setAttributes({
      [genAiAttributes.OPENAI_USAGE_PROMPT_TOKENS_ATTRIBUTE]: promptTokens,
      [genAiAttributes.GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: promptTokens,
    });
  }
  if (completionTokens !== undefined) {
    span.setAttributes({
      [genAiAttributes.OPENAI_USAGE_COMPLETION_TOKENS_ATTRIBUTE]: completionTokens,
      [genAiAttributes.GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: completionTokens,
    });
  }
  if (totalTokens !== undefined) {
    span.setAttributes({
      [genAiAttributes.GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: totalTokens,
    });
  }
}

/**
 * Helper function to set common response attributes (ID, model, timestamp)
 */
function setCommonResponseAttributes(span, id, model, timestamp) {
  if (id) {
    span.setAttributes({
      [genAiAttributes.OPENAI_RESPONSE_ID_ATTRIBUTE]: id,
      [genAiAttributes.GEN_AI_RESPONSE_ID_ATTRIBUTE]: id,
    });
  }
  if (model) {
    span.setAttributes({
      [genAiAttributes.OPENAI_RESPONSE_MODEL_ATTRIBUTE]: model,
      [genAiAttributes.GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: model,
    });
  }
  if (timestamp) {
    span.setAttributes({
      [genAiAttributes.OPENAI_RESPONSE_TIMESTAMP_ATTRIBUTE]: new Date(timestamp * 1000).toISOString(),
    });
  }
}

/**
 * Add attributes for Chat Completion responses
 */
function addChatCompletionAttributes(span, response) {
  setCommonResponseAttributes(span, response.id, response.model, response.created);
  if (response.usage) {
    setTokenUsageAttributes(
      span,
      response.usage.prompt_tokens,
      response.usage.completion_tokens,
      response.usage.total_tokens,
    );
  }
  if (Array.isArray(response.choices)) {
    const finishReasons = response.choices
      .map(choice => choice.finish_reason)
      .filter((reason) => reason !== null);
    if (finishReasons.length > 0) {
      span.setAttributes({
        [genAiAttributes.GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]: JSON.stringify(finishReasons),
      });
    }
  }
}

/**
 * Add attributes for Responses API responses
 */
function addResponsesApiAttributes(span, response) {
  setCommonResponseAttributes(span, response.id, response.model, response.created_at);
  if (response.status) {
    span.setAttributes({
      [genAiAttributes.GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]: JSON.stringify([response.status]),
    });
  }
  if (response.usage) {
    setTokenUsageAttributes(
      span,
      response.usage.input_tokens,
      response.usage.output_tokens,
      response.usage.total_tokens,
    );
  }
}

/**
 * Add response attributes to spans
 * This currently supports both Chat Completion and Responses API responses
 */
function addResponseAttributes(span, result, recordOutputs) {
  if (!result || typeof result !== 'object') return;

  const response = result ;

  if (utils.isChatCompletionResponse(response)) {
    addChatCompletionAttributes(span, response);
    if (recordOutputs && response.choices?.length) {
      const responseTexts = response.choices.map(choice => choice.message?.content || '');
      span.setAttributes({ [genAiAttributes.GEN_AI_RESPONSE_TEXT_ATTRIBUTE]: JSON.stringify(responseTexts) });
    }
  } else if (utils.isResponsesApiResponse(response)) {
    addResponsesApiAttributes(span, response);
    if (recordOutputs && response.output_text) {
      span.setAttributes({ [genAiAttributes.GEN_AI_RESPONSE_TEXT_ATTRIBUTE]: response.output_text });
    }
  }
}

// Extract and record AI request inputs, if present. This is intentionally separate from response attributes.
function addRequestAttributes(span, params) {
  if ('messages' in params) {
    span.setAttributes({ [genAiAttributes.GEN_AI_REQUEST_MESSAGES_ATTRIBUTE]: JSON.stringify(params.messages) });
  }
  if ('input' in params) {
    span.setAttributes({ [genAiAttributes.GEN_AI_REQUEST_MESSAGES_ATTRIBUTE]: JSON.stringify(params.input) });
  }
}

function getOptionsFromIntegration() {
  const scope = currentScopes.getCurrentScope();
  const client = scope.getClient();
  const integration = client?.getIntegrationByName(constants.OPENAI_INTEGRATION_NAME) ;
  const shouldRecordInputsAndOutputs = integration ? Boolean(client?.getOptions().sendDefaultPii) : false;

  return {
    recordInputs: integration?.options?.recordInputs ?? shouldRecordInputsAndOutputs,
    recordOutputs: integration?.options?.recordOutputs ?? shouldRecordInputsAndOutputs,
  };
}

/**
 * Instrument a method with Sentry spans
 * Following Sentry AI Agents Manual Instrumentation conventions
 * @see https://docs.sentry.io/platforms/javascript/guides/node/tracing/instrumentation/ai-agents-module/#manual-instrumentation
 */
function instrumentMethod(
  originalMethod,
  methodPath,
  context,
  options,
) {
  return async function instrumentedMethod(...args) {
    const finalOptions = options || getOptionsFromIntegration();
    const requestAttributes = extractRequestAttributes(args, methodPath);
    const model = (requestAttributes[genAiAttributes.GEN_AI_REQUEST_MODEL_ATTRIBUTE] ) || 'unknown';
    const operationName = utils.getOperationName(methodPath);

    return trace.startSpan(
      {
        name: `${operationName} ${model}`,
        op: utils.getSpanOperation(methodPath),
        attributes: requestAttributes ,
      },
      async (span) => {
        try {
          if (finalOptions.recordInputs && args[0] && typeof args[0] === 'object') {
            addRequestAttributes(span, args[0] );
          }

          const result = await originalMethod.apply(context, args);
          // TODO: Add streaming support
          addResponseAttributes(span, result, finalOptions.recordOutputs);
          return result;
        } catch (error) {
          exports$1.captureException(error);
          throw error;
        }
      },
    );
  };
}

/**
 * Create a deep proxy for OpenAI client instrumentation
 */
function createDeepProxy(target, currentPath = '', options) {
  return new Proxy(target, {
    get(obj, prop) {
      const value = (obj )[prop];
      const methodPath = utils.buildMethodPath(currentPath, String(prop));

      if (typeof value === 'function' && utils.shouldInstrument(methodPath)) {
        return instrumentMethod(value , methodPath, obj, options);
      }

      if (typeof value === 'function') {
        // Bind non-instrumented functions to preserve the original `this` context,
        // which is required for accessing private class fields (e.g. #baseURL) in OpenAI SDK v5.
        return value.bind(obj);
      }

      if (value && typeof value === 'object') {
        return createDeepProxy(value , methodPath, options);
      }

      return value;
    },
  });
}

/**
 * Instrument an OpenAI client with Sentry tracing
 * Can be used across Node.js, Cloudflare Workers, and Vercel Edge
 */
function instrumentOpenAiClient(client, options) {
  return createDeepProxy(client, '', options);
}

exports.instrumentOpenAiClient = instrumentOpenAiClient;
//# sourceMappingURL=index.js.map
