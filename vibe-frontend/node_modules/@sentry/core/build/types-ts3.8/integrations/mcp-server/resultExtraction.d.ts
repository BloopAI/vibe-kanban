/**
 * Result extraction functions for MCP server instrumentation
 *
 * Handles extraction of attributes from tool and prompt execution results.
 */
/**
 * Extract tool result attributes for span instrumentation
 * @param result - Tool execution result
 * @returns Attributes extracted from tool result content
 */
export declare function extractToolResultAttributes(result: unknown): Record<string, string | number | boolean>;
/**
 * Extract prompt result attributes for span instrumentation
 * @param result - Prompt execution result
 * @returns Attributes extracted from prompt result
 */
export declare function extractPromptResultAttributes(result: unknown): Record<string, string | number | boolean>;
//# sourceMappingURL=resultExtraction.d.ts.map
