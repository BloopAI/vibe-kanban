Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const currentScopes = require('../../currentScopes.js');
const spanstatus = require('../../tracing/spanstatus.js');
const piiFiltering = require('./piiFiltering.js');
const resultExtraction = require('./resultExtraction.js');

/**
 * Request-span correlation system for MCP server instrumentation
 *
 * Handles mapping requestId to span data for correlation with handler execution.
 * Uses WeakMap to scope correlation maps per transport instance, preventing
 * request ID collisions between different MCP sessions.
 */


/**
 * Transport-scoped correlation system that prevents collisions between different MCP sessions
 * @internal Each transport instance gets its own correlation map, eliminating request ID conflicts
 */
const transportToSpanMap = new WeakMap();

/**
 * Gets or creates the span map for a specific transport instance
 * @internal
 * @param transport - MCP transport instance
 * @returns Span map for the transport
 */
function getOrCreateSpanMap(transport) {
  let spanMap = transportToSpanMap.get(transport);
  if (!spanMap) {
    spanMap = new Map();
    transportToSpanMap.set(transport, spanMap);
  }
  return spanMap;
}

/**
 * Stores span context for later correlation with handler execution
 * @param transport - MCP transport instance
 * @param requestId - Request identifier
 * @param span - Active span to correlate
 * @param method - MCP method name
 */
function storeSpanForRequest(transport, requestId, span, method) {
  const spanMap = getOrCreateSpanMap(transport);
  spanMap.set(requestId, {
    span,
    method,
    startTime: Date.now(),
  });
}

/**
 * Completes span with tool results and cleans up correlation
 * @param transport - MCP transport instance
 * @param requestId - Request identifier
 * @param result - Tool execution result for attribute extraction
 */
function completeSpanWithResults(transport, requestId, result) {
  const spanMap = getOrCreateSpanMap(transport);
  const spanData = spanMap.get(requestId);
  if (spanData) {
    const { span, method } = spanData;

    if (method === 'tools/call') {
      const rawToolAttributes = resultExtraction.extractToolResultAttributes(result);
      const client = currentScopes.getClient();
      const sendDefaultPii = Boolean(client?.getOptions().sendDefaultPii);
      const toolAttributes = piiFiltering.filterMcpPiiFromSpanData(rawToolAttributes, sendDefaultPii);

      span.setAttributes(toolAttributes);
    } else if (method === 'prompts/get') {
      const rawPromptAttributes = resultExtraction.extractPromptResultAttributes(result);
      const client = currentScopes.getClient();
      const sendDefaultPii = Boolean(client?.getOptions().sendDefaultPii);
      const promptAttributes = piiFiltering.filterMcpPiiFromSpanData(rawPromptAttributes, sendDefaultPii);

      span.setAttributes(promptAttributes);
    }

    span.end();
    spanMap.delete(requestId);
  }
}

/**
 * Cleans up pending spans for a specific transport (when that transport closes)
 * @param transport - MCP transport instance
 * @returns Number of pending spans that were cleaned up
 */
function cleanupPendingSpansForTransport(transport) {
  const spanMap = transportToSpanMap.get(transport);
  if (!spanMap) {
    return 0;
  }

  const pendingCount = spanMap.size;

  for (const [, spanData] of spanMap) {
    spanData.span.setStatus({
      code: spanstatus.SPAN_STATUS_ERROR,
      message: 'cancelled',
    });
    spanData.span.end();
  }

  spanMap.clear();
  return pendingCount;
}

exports.cleanupPendingSpansForTransport = cleanupPendingSpansForTransport;
exports.completeSpanWithResults = completeSpanWithResults;
exports.storeSpanForRequest = storeSpanForRequest;
//# sourceMappingURL=correlation.js.map
