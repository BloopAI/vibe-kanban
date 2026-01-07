/**
 * PII filtering for MCP server spans
 *
 * Removes sensitive data when sendDefaultPii is false.
 * Uses configurable attribute filtering to protect user privacy.
 */
import { SpanAttributeValue } from '../../types-hoist/span';
/**
 * Removes PII attributes from span data when sendDefaultPii is false
 * @param spanData - Raw span attributes
 * @param sendDefaultPii - Whether to include PII data
 * @returns Filtered span attributes
 */
export declare function filterMcpPiiFromSpanData(spanData: Record<string, unknown>, sendDefaultPii: boolean): Record<string, SpanAttributeValue>;
//# sourceMappingURL=piiFiltering.d.ts.map
