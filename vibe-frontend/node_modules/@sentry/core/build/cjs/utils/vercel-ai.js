Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const semanticAttributes = require('../semanticAttributes.js');
const spanUtils = require('./spanUtils.js');
const vercelAiAttributes = require('./vercel-ai-attributes.js');

function addOriginToSpan(span, origin) {
  span.setAttribute(semanticAttributes.SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, origin);
}

/**
 * Post-process spans emitted by the Vercel AI SDK.
 * This is supposed to be used in `client.on('spanStart', ...)
 */
function onVercelAiSpanStart(span) {
  const { data: attributes, description: name } = spanUtils.spanToJSON(span);

  if (!name) {
    return;
  }

  // Tool call spans
  // https://ai-sdk.dev/docs/ai-sdk-core/telemetry#tool-call-spans
  if (attributes[vercelAiAttributes.AI_TOOL_CALL_NAME_ATTRIBUTE] && attributes[vercelAiAttributes.AI_TOOL_CALL_ID_ATTRIBUTE] && name === 'ai.toolCall') {
    processToolCallSpan(span, attributes);
    return;
  }

  // The AI and Provider must be defined for generate, stream, and embed spans.
  // The id of the model
  const aiModelId = attributes[vercelAiAttributes.AI_MODEL_ID_ATTRIBUTE];
  // the provider of the model
  const aiModelProvider = attributes[vercelAiAttributes.AI_MODEL_PROVIDER_ATTRIBUTE];
  if (typeof aiModelId !== 'string' || typeof aiModelProvider !== 'string' || !aiModelId || !aiModelProvider) {
    return;
  }

  processGenerateSpan(span, name, attributes);
}

function vercelAiEventProcessor(event) {
  if (event.type === 'transaction' && event.spans) {
    for (const span of event.spans) {
      // this mutates spans in-place
      processEndedVercelAiSpan(span);
    }
  }
  return event;
}
/**
 * Post-process spans emitted by the Vercel AI SDK.
 */
function processEndedVercelAiSpan(span) {
  const { data: attributes, origin } = span;

  if (origin !== 'auto.vercelai.otel') {
    return;
  }

  renameAttributeKey(attributes, vercelAiAttributes.AI_USAGE_COMPLETION_TOKENS_ATTRIBUTE, vercelAiAttributes.GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE);
  renameAttributeKey(attributes, vercelAiAttributes.AI_USAGE_PROMPT_TOKENS_ATTRIBUTE, vercelAiAttributes.GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE);

  if (
    typeof attributes[vercelAiAttributes.GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE] === 'number' &&
    typeof attributes[vercelAiAttributes.GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE] === 'number'
  ) {
    attributes['gen_ai.usage.total_tokens'] =
      attributes[vercelAiAttributes.GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE] + attributes[vercelAiAttributes.GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE];
  }

  // Rename AI SDK attributes to standardized gen_ai attributes
  renameAttributeKey(attributes, vercelAiAttributes.AI_PROMPT_MESSAGES_ATTRIBUTE, 'gen_ai.request.messages');
  renameAttributeKey(attributes, vercelAiAttributes.AI_RESPONSE_TEXT_ATTRIBUTE, 'gen_ai.response.text');
  renameAttributeKey(attributes, vercelAiAttributes.AI_RESPONSE_TOOL_CALLS_ATTRIBUTE, 'gen_ai.response.tool_calls');
  renameAttributeKey(attributes, vercelAiAttributes.AI_RESPONSE_OBJECT_ATTRIBUTE, 'gen_ai.response.object');
  renameAttributeKey(attributes, vercelAiAttributes.AI_PROMPT_TOOLS_ATTRIBUTE, 'gen_ai.request.available_tools');

  renameAttributeKey(attributes, vercelAiAttributes.AI_TOOL_CALL_ARGS_ATTRIBUTE, 'gen_ai.tool.input');
  renameAttributeKey(attributes, vercelAiAttributes.AI_TOOL_CALL_RESULT_ATTRIBUTE, 'gen_ai.tool.output');

  addProviderMetadataToAttributes(attributes);

  // Change attributes namespaced with `ai.X` to `vercel.ai.X`
  for (const key of Object.keys(attributes)) {
    if (key.startsWith('ai.')) {
      renameAttributeKey(attributes, key, `vercel.${key}`);
    }
  }
}

/**
 * Renames an attribute key in the provided attributes object if the old key exists.
 * This function safely handles null and undefined values.
 */
function renameAttributeKey(attributes, oldKey, newKey) {
  if (attributes[oldKey] != null) {
    attributes[newKey] = attributes[oldKey];
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete attributes[oldKey];
  }
}

function processToolCallSpan(span, attributes) {
  addOriginToSpan(span, 'auto.vercelai.otel');
  span.setAttribute(semanticAttributes.SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.execute_tool');
  renameAttributeKey(attributes, vercelAiAttributes.AI_TOOL_CALL_NAME_ATTRIBUTE, 'gen_ai.tool.name');
  renameAttributeKey(attributes, vercelAiAttributes.AI_TOOL_CALL_ID_ATTRIBUTE, 'gen_ai.tool.call.id');
  // https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/#gen-ai-tool-type
  if (!attributes['gen_ai.tool.type']) {
    span.setAttribute('gen_ai.tool.type', 'function');
  }
  const toolName = attributes['gen_ai.tool.name'];
  if (toolName) {
    span.updateName(`execute_tool ${toolName}`);
  }
}

function processGenerateSpan(span, name, attributes) {
  addOriginToSpan(span, 'auto.vercelai.otel');

  const nameWthoutAi = name.replace('ai.', '');
  span.setAttribute('ai.pipeline.name', nameWthoutAi);
  span.updateName(nameWthoutAi);

  // If a Telemetry name is set and it is a pipeline span, use that as the operation name
  const functionId = attributes[vercelAiAttributes.AI_TELEMETRY_FUNCTION_ID_ATTRIBUTE];
  if (functionId && typeof functionId === 'string' && name.split('.').length - 1 === 1) {
    span.updateName(`${nameWthoutAi} ${functionId}`);
    span.setAttribute('gen_ai.function_id', functionId);
  }

  if (attributes[vercelAiAttributes.AI_PROMPT_ATTRIBUTE]) {
    span.setAttribute('gen_ai.prompt', attributes[vercelAiAttributes.AI_PROMPT_ATTRIBUTE]);
  }
  if (attributes[vercelAiAttributes.AI_MODEL_ID_ATTRIBUTE] && !attributes[vercelAiAttributes.GEN_AI_RESPONSE_MODEL_ATTRIBUTE]) {
    span.setAttribute(vercelAiAttributes.GEN_AI_RESPONSE_MODEL_ATTRIBUTE, attributes[vercelAiAttributes.AI_MODEL_ID_ATTRIBUTE]);
  }
  span.setAttribute('ai.streaming', name.includes('stream'));

  // Generate Spans
  if (name === 'ai.generateText') {
    span.setAttribute(semanticAttributes.SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.invoke_agent');
    return;
  }

  if (name === 'ai.generateText.doGenerate') {
    span.setAttribute(semanticAttributes.SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.generate_text');
    span.updateName(`generate_text ${attributes[vercelAiAttributes.AI_MODEL_ID_ATTRIBUTE]}`);
    return;
  }

  if (name === 'ai.streamText') {
    span.setAttribute(semanticAttributes.SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.invoke_agent');
    return;
  }

  if (name === 'ai.streamText.doStream') {
    span.setAttribute(semanticAttributes.SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.stream_text');
    span.updateName(`stream_text ${attributes[vercelAiAttributes.AI_MODEL_ID_ATTRIBUTE]}`);
    return;
  }

  if (name === 'ai.generateObject') {
    span.setAttribute(semanticAttributes.SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.invoke_agent');
    return;
  }

  if (name === 'ai.generateObject.doGenerate') {
    span.setAttribute(semanticAttributes.SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.generate_object');
    span.updateName(`generate_object ${attributes[vercelAiAttributes.AI_MODEL_ID_ATTRIBUTE]}`);
    return;
  }

  if (name === 'ai.streamObject') {
    span.setAttribute(semanticAttributes.SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.invoke_agent');
    return;
  }

  if (name === 'ai.streamObject.doStream') {
    span.setAttribute(semanticAttributes.SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.stream_object');
    span.updateName(`stream_object ${attributes[vercelAiAttributes.AI_MODEL_ID_ATTRIBUTE]}`);
    return;
  }

  if (name === 'ai.embed') {
    span.setAttribute(semanticAttributes.SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.invoke_agent');
    return;
  }

  if (name === 'ai.embed.doEmbed') {
    span.setAttribute(semanticAttributes.SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.embed');
    span.updateName(`embed ${attributes[vercelAiAttributes.AI_MODEL_ID_ATTRIBUTE]}`);
    return;
  }

  if (name === 'ai.embedMany') {
    span.setAttribute(semanticAttributes.SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.invoke_agent');
    return;
  }

  if (name === 'ai.embedMany.doEmbed') {
    span.setAttribute(semanticAttributes.SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.embed_many');
    span.updateName(`embed_many ${attributes[vercelAiAttributes.AI_MODEL_ID_ATTRIBUTE]}`);
    return;
  }

  if (name.startsWith('ai.stream')) {
    span.setAttribute(semanticAttributes.SEMANTIC_ATTRIBUTE_SENTRY_OP, 'ai.run');
    return;
  }
}

/**
 * Add event processors to the given client to process Vercel AI spans.
 */
function addVercelAiProcessors(client) {
  client.on('spanStart', onVercelAiSpanStart);
  // Note: We cannot do this on `spanEnd`, because the span cannot be mutated anymore at this point
  client.addEventProcessor(Object.assign(vercelAiEventProcessor, { id: 'VercelAiEventProcessor' }));
}

function addProviderMetadataToAttributes(attributes) {
  const providerMetadata = attributes[vercelAiAttributes.AI_RESPONSE_PROVIDER_METADATA_ATTRIBUTE] ;
  if (providerMetadata) {
    try {
      const providerMetadataObject = JSON.parse(providerMetadata) ;
      if (providerMetadataObject.openai) {
        setAttributeIfDefined(
          attributes,
          'gen_ai.usage.input_tokens.cached',
          providerMetadataObject.openai.cachedPromptTokens,
        );
        setAttributeIfDefined(
          attributes,
          'gen_ai.usage.output_tokens.reasoning',
          providerMetadataObject.openai.reasoningTokens,
        );
        setAttributeIfDefined(
          attributes,
          'gen_ai.usage.output_tokens.prediction_accepted',
          providerMetadataObject.openai.acceptedPredictionTokens,
        );
        setAttributeIfDefined(
          attributes,
          'gen_ai.usage.output_tokens.prediction_rejected',
          providerMetadataObject.openai.rejectedPredictionTokens,
        );
        setAttributeIfDefined(attributes, 'gen_ai.conversation.id', providerMetadataObject.openai.responseId);
      }

      if (providerMetadataObject.anthropic) {
        setAttributeIfDefined(
          attributes,
          'gen_ai.usage.input_tokens.cached',
          providerMetadataObject.anthropic.cacheReadInputTokens,
        );
        setAttributeIfDefined(
          attributes,
          'gen_ai.usage.input_tokens.cache_write',
          providerMetadataObject.anthropic.cacheCreationInputTokens,
        );
      }

      if (providerMetadataObject.bedrock?.usage) {
        setAttributeIfDefined(
          attributes,
          'gen_ai.usage.input_tokens.cached',
          providerMetadataObject.bedrock.usage.cacheReadInputTokens,
        );
        setAttributeIfDefined(
          attributes,
          'gen_ai.usage.input_tokens.cache_write',
          providerMetadataObject.bedrock.usage.cacheWriteInputTokens,
        );
      }

      if (providerMetadataObject.deepseek) {
        setAttributeIfDefined(
          attributes,
          'gen_ai.usage.input_tokens.cached',
          providerMetadataObject.deepseek.promptCacheHitTokens,
        );
        setAttributeIfDefined(
          attributes,
          'gen_ai.usage.input_tokens.cache_miss',
          providerMetadataObject.deepseek.promptCacheMissTokens,
        );
      }
    } catch {
      // Ignore
    }
  }
}

/**
 * Sets an attribute only if the value is not null or undefined.
 */
function setAttributeIfDefined(attributes, key, value) {
  if (value != null) {
    attributes[key] = value;
  }
}

exports.addVercelAiProcessors = addVercelAiProcessors;
//# sourceMappingURL=vercel-ai.js.map
