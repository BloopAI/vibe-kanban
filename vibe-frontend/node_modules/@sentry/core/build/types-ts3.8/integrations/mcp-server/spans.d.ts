/**
 * Span creation and management functions for MCP server instrumentation
 *
 * Provides unified span creation following OpenTelemetry MCP semantic conventions and our opinitionated take on MCP.
 * Handles both request and notification spans with attribute extraction.
 */
import { ExtraHandlerData, JsonRpcNotification, JsonRpcRequest, MCPTransport } from './types';
/**
 * Creates a span for incoming MCP notifications
 * @param jsonRpcMessage - Notification message
 * @param transport - MCP transport instance
 * @param extra - Extra handler data
 * @param callback - Span execution callback
 * @returns Span execution result
 */
export declare function createMcpNotificationSpan(jsonRpcMessage: JsonRpcNotification, transport: MCPTransport, extra: ExtraHandlerData, callback: () => unknown): unknown;
/**
 * Creates a span for outgoing MCP notifications
 * @param jsonRpcMessage - Notification message
 * @param transport - MCP transport instance
 * @param callback - Span execution callback
 * @returns Span execution result
 */
export declare function createMcpOutgoingNotificationSpan(jsonRpcMessage: JsonRpcNotification, transport: MCPTransport, callback: () => unknown): unknown;
/**
 * Builds span configuration for MCP server requests
 * @param jsonRpcMessage - Request message
 * @param transport - MCP transport instance
 * @param extra - Optional extra handler data
 * @returns Span configuration object
 */
export declare function buildMcpServerSpanConfig(jsonRpcMessage: JsonRpcRequest, transport: MCPTransport, extra?: ExtraHandlerData): {
    name: string;
    op: string;
    forceTransaction: boolean;
    attributes: Record<string, string | number>;
};
//# sourceMappingURL=spans.d.ts.map
