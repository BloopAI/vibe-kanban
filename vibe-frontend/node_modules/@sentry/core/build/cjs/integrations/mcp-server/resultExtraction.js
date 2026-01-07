Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const attributes = require('./attributes.js');
const validation = require('./validation.js');

/**
 * Result extraction functions for MCP server instrumentation
 *
 * Handles extraction of attributes from tool and prompt execution results.
 */


/**
 * Build attributes for tool result content items
 * @param content - Array of content items from tool result
 * @returns Attributes extracted from each content item including type, text, mime type, URI, and resource info
 */
function buildAllContentItemAttributes(content) {
  const attributes$1 = {
    [attributes.MCP_TOOL_RESULT_CONTENT_COUNT_ATTRIBUTE]: content.length,
  };

  for (const [i, item] of content.entries()) {
    if (!validation.isValidContentItem(item)) {
      continue;
    }

    const prefix = content.length === 1 ? 'mcp.tool.result' : `mcp.tool.result.${i}`;

    const safeSet = (key, value) => {
      if (typeof value === 'string') {
        attributes$1[`${prefix}.${key}`] = value;
      }
    };

    safeSet('content_type', item.type);
    safeSet('mime_type', item.mimeType);
    safeSet('uri', item.uri);
    safeSet('name', item.name);

    if (typeof item.text === 'string') {
      attributes$1[`${prefix}.content`] = item.text;
    }

    if (typeof item.data === 'string') {
      attributes$1[`${prefix}.data_size`] = item.data.length;
    }

    const resource = item.resource;
    if (validation.isValidContentItem(resource)) {
      safeSet('resource_uri', resource.uri);
      safeSet('resource_mime_type', resource.mimeType);
    }
  }

  return attributes$1;
}

/**
 * Extract tool result attributes for span instrumentation
 * @param result - Tool execution result
 * @returns Attributes extracted from tool result content
 */
function extractToolResultAttributes(result) {
  if (!validation.isValidContentItem(result)) {
    return {};
  }

  const attributes$1 = Array.isArray(result.content) ? buildAllContentItemAttributes(result.content) : {};

  if (typeof result.isError === 'boolean') {
    attributes$1[attributes.MCP_TOOL_RESULT_IS_ERROR_ATTRIBUTE] = result.isError;
  }

  return attributes$1;
}

/**
 * Extract prompt result attributes for span instrumentation
 * @param result - Prompt execution result
 * @returns Attributes extracted from prompt result
 */
function extractPromptResultAttributes(result) {
  const attributes$1 = {};
  if (!validation.isValidContentItem(result)) {
    return attributes$1;
  }

  if (typeof result.description === 'string') {
    attributes$1[attributes.MCP_PROMPT_RESULT_DESCRIPTION_ATTRIBUTE] = result.description;
  }

  if (Array.isArray(result.messages)) {
    attributes$1[attributes.MCP_PROMPT_RESULT_MESSAGE_COUNT_ATTRIBUTE] = result.messages.length;

    const messages = result.messages;
    for (const [i, message] of messages.entries()) {
      if (!validation.isValidContentItem(message)) {
        continue;
      }

      const prefix = messages.length === 1 ? 'mcp.prompt.result' : `mcp.prompt.result.${i}`;

      const safeSet = (key, value) => {
        if (typeof value === 'string') {
          const attrName = messages.length === 1 ? `${prefix}.message_${key}` : `${prefix}.${key}`;
          attributes$1[attrName] = value;
        }
      };

      safeSet('role', message.role);

      if (validation.isValidContentItem(message.content)) {
        const content = message.content;
        if (typeof content.text === 'string') {
          const attrName = messages.length === 1 ? `${prefix}.message_content` : `${prefix}.content`;
          attributes$1[attrName] = content.text;
        }
      }
    }
  }

  return attributes$1;
}

exports.extractPromptResultAttributes = extractPromptResultAttributes;
exports.extractToolResultAttributes = extractToolResultAttributes;
//# sourceMappingURL=resultExtraction.js.map
