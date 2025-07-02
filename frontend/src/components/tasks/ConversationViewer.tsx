import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

import {
  Brain,
  Wrench as Tool,
  ChevronDown,
  ChevronUp,
  Clock,
  Zap,
  AlertTriangle,
  FileText,
} from 'lucide-react';

interface JSONLLine {
  type: string;
  threadID?: string;
  // Amp format
  messages?: [
    number,
    {
      role: 'user' | 'assistant';
      content: Array<{
        type: 'text' | 'thinking' | 'tool_use' | 'tool_result';
        text?: string;
        thinking?: string;
        id?: string;
        name?: string;
        input?: any;
        toolUseID?: string;
        run?: {
          status: string;
          result?: string;
          toAllow?: string[];
        };
      }>;
      meta?: {
        sentAt: number;
      };
      state?: {
        type: string;
        stopReason?: string;
      };
    },
  ][];
  toolResults?: Array<{
    type: 'tool_use' | 'tool_result';
    id?: string;
    name?: string;
    input?: any;
    toolUseID?: string;
    run?: {
      status: string;
      result?: string;
      toAllow?: string[];
    };
  }>;
  tokenUsage?: {
    used: number;
    maxAvailable: number;
  };
  state?: string;
  tool?: string;
  command?: string;
  // Claude format
  message?: {
    role: 'user' | 'assistant' | 'system';
    content:
      | Array<{
          type: 'text' | 'tool_use' | 'tool_result';
          text?: string;
          id?: string;
          name?: string;
          input?: any;
          tool_use_id?: string;
          content?: any;
          is_error?: boolean;
        }>
      | string;
  };
  messageKey?: number;
  isStreaming?: boolean;
  // Tool rejection message (string format)
  rejectionMessage?: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  result?: any;
  duration_ms?: number;
  total_cost_usd?: number;
  error?: string; // For parse errors
}

interface ConversationViewerProps {
  jsonlOutput: string;
}

// Validation functions
const isValidMessage = (data: any): boolean => {
  return (
    typeof data.role === 'string' &&
    Array.isArray(data.content) &&
    data.content.every(
      (item: any) =>
        typeof item.type === 'string' &&
        (item.type !== 'text' || typeof item.text === 'string') &&
        (item.type !== 'thinking' || typeof item.thinking === 'string') &&
        (item.type !== 'tool_use' || typeof item.name === 'string') &&
        (item.type !== 'tool_result' ||
          !item.run ||
          typeof item.run.status === 'string')
    )
  );
};

const isValidClaudeMessage = (data: any): boolean => {
  return (
    typeof data.role === 'string' &&
    (typeof data.content === 'string' ||
      (Array.isArray(data.content) &&
        data.content.every(
          (item: any) =>
            typeof item.type === 'string' &&
            (item.type !== 'text' || typeof item.text === 'string') &&
            (item.type !== 'tool_use' || typeof item.name === 'string') &&
            (item.type !== 'tool_result' || typeof item.content !== 'undefined')
        )))
  );
};

const isValidTokenUsage = (data: any): boolean => {
  return (
    data &&
    typeof data.used === 'number' &&
    typeof data.maxAvailable === 'number'
  );
};

const isValidClaudeUsage = (data: any): boolean => {
  return (
    data &&
    typeof data.input_tokens === 'number' &&
    typeof data.output_tokens === 'number'
  );
};

const isValidToolRejection = (data: any): boolean => {
  return (
    typeof data.tool === 'string' &&
    typeof data.command === 'string' &&
    (typeof data.message === 'string' ||
      typeof data.rejectionMessage === 'string')
  );
};

const isValidMessagesLine = (line: any): boolean => {
  return (
    Array.isArray(line.messages) &&
    line.messages.every(
      (msg: any) =>
        Array.isArray(msg) &&
        msg.length >= 2 &&
        typeof msg[0] === 'number' &&
        isValidMessage(msg[1])
    )
  );
};

export function ConversationViewer({ jsonlOutput }: ConversationViewerProps) {
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(
    new Set()
  );
  const [showTokenUsage, setShowTokenUsage] = useState(false);

  const parsedLines = useMemo(() => {
    try {
      return jsonlOutput
        .split('\n')
        .filter((line) => line.trim())
        .map((line, index) => {
          try {
            const parsed = JSON.parse(line);
            return {
              ...parsed,
              _lineIndex: index,
              _rawLine: line,
            } as JSONLLine & { _lineIndex: number; _rawLine: string };
          } catch {
            return {
              type: 'parse-error',
              _lineIndex: index,
              _rawLine: line,
              error: 'Failed to parse JSON',
            } as JSONLLine & {
              _lineIndex: number;
              _rawLine: string;
              error: string;
            };
          }
        });
    } catch {
      return [];
    }
  }, [jsonlOutput]);

  const conversation = useMemo(() => {
    const streamingMessageMap = new Map<number, any>();
    const items: Array<{
      type: 'message' | 'tool-rejection' | 'parse-error' | 'unknown';
      role?: 'user' | 'assistant';
      content?: Array<{
        type: string;
        text?: string;
        thinking?: string;
        id?: string;
        name?: string;
        input?: any;
        toolUseID?: string;
        run?: any;
      }>;
      timestamp?: number;
      messageIndex?: number;
      lineIndex?: number;
      tool?: string;
      command?: string;
      message?: string;
      error?: string;
      rawLine?: string;
    }> = [];

    const tokenUsages: Array<{
      used: number;
      maxAvailable: number;
      lineIndex: number;
    }> = [];
    const states: Array<{ state: string; lineIndex: number }> = [];

    for (const line of parsedLines) {
      try {
        if (line.type === 'parse-error') {
          items.push({
            type: 'parse-error',
            error: line.error,
            rawLine: line._rawLine,
            lineIndex: line._lineIndex,
          });
        } else if (
          line.type === 'messages' &&
          isValidMessagesLine(line) &&
          line.messages
        ) {
          // Amp format
          for (const [messageIndex, message] of line.messages) {
            const messageItem = {
              type: 'message' as const,
              role: message.role,
              content: message.content,
              timestamp: message.meta?.sentAt,
              messageIndex,
              lineIndex: line._lineIndex,
            };

            // Handle Gemini streaming via top-level messageKey and isStreaming
            if (line.isStreaming && line.messageKey !== undefined) {
              const existingMessage = streamingMessageMap.get(line.messageKey);
              if (existingMessage) {
                // Append new content to existing message
                if (
                  existingMessage.content &&
                  existingMessage.content[0] &&
                  messageItem.content &&
                  messageItem.content[0]
                ) {
                  existingMessage.content[0].text =
                    (existingMessage.content[0].text || '') +
                    (messageItem.content[0].text || '');
                  existingMessage.timestamp = messageItem.timestamp; // Update timestamp
                }
              } else {
                // First segment for this message
                streamingMessageMap.set(line.messageKey, messageItem);
              }
            } else {
              items.push(messageItem);
            }
          }
        } else if (
          (line.type === 'user' ||
            line.type === 'assistant' ||
            line.type === 'system') &&
          line.message &&
          isValidClaudeMessage(line.message)
        ) {
          // Claude format
          const content =
            typeof line.message.content === 'string'
              ? [{ type: 'text', text: line.message.content }]
              : line.message.content;

          items.push({
            type: 'message',
            role:
              line.message.role === 'system' ? 'assistant' : line.message.role,
            content: content,
            lineIndex: line._lineIndex,
          });
        } else if (
          line.type === 'result' &&
          line.usage &&
          isValidClaudeUsage(line.usage)
        ) {
          // Claude usage info
          tokenUsages.push({
            used: line.usage.input_tokens + line.usage.output_tokens,
            maxAvailable:
              line.usage.input_tokens + line.usage.output_tokens + 100000, // Approximate
            lineIndex: line._lineIndex,
          });
        } else if (
          line.type === 'token-usage' &&
          line.tokenUsage &&
          isValidTokenUsage(line.tokenUsage)
        ) {
          // Amp format
          tokenUsages.push({
            used: line.tokenUsage.used,
            maxAvailable: line.tokenUsage.maxAvailable,
            lineIndex: line._lineIndex,
          });
        } else if (line.type === 'state' && typeof line.state === 'string') {
          states.push({
            state: line.state,
            lineIndex: line._lineIndex,
          });
        } else if (
          line.type === 'tool-rejected' &&
          isValidToolRejection(line)
        ) {
          items.push({
            type: 'tool-rejection',
            tool: line.tool,
            command: line.command,
            message:
              typeof line.message === 'string'
                ? line.message
                : line.rejectionMessage || 'Tool rejected',
            lineIndex: line._lineIndex,
          });
        } else {
          // Unknown line type or invalid structure - add as unknown for fallback rendering
          items.push({
            type: 'unknown',
            rawLine: line._rawLine,
            lineIndex: line._lineIndex,
          });
        }
      } catch (error) {
        // If anything goes wrong processing a line, treat it as unknown
        items.push({
          type: 'unknown',
          rawLine: line._rawLine,
          lineIndex: line._lineIndex,
        });
      }
    }

    const streamingMessages = Array.from(streamingMessageMap.values());
    const finalItems = [...items, ...streamingMessages];

    // Sort by messageIndex for messages, then by lineIndex for everything else
    finalItems.sort((a, b) => {
      if (a.type === 'message' && b.type === 'message') {
        return (a.messageIndex || 0) - (b.messageIndex || 0);
      }
      return (a.lineIndex || 0) - (b.lineIndex || 0);
    });

    return {
      items: finalItems,
      tokenUsages,
      states,
    };
  }, [parsedLines]);

  const toggleMessage = (messageId: string) => {
    const newExpanded = new Set(expandedMessages);
    if (newExpanded.has(messageId)) {
      newExpanded.delete(messageId);
    } else {
      newExpanded.add(messageId);
    }
    setExpandedMessages(newExpanded);
  };

  const formatToolInput = (input: any): string => {
    try {
      if (input === null || input === undefined) {
        return String(input);
      }
      if (typeof input === 'object') {
        // Try to stringify, but handle circular references and complex objects
        return JSON.stringify(input);
      }
      return String(input);
    } catch (error) {
      // If anything goes wrong, return a safe fallback
      return `[Unable to display input: ${String(input).substring(0, 100)}...]`;
    }
  };

  const safeRenderString = (value: any): string => {
    if (typeof value === 'string') {
      return value;
    }
    if (value === null || value === undefined) {
      return String(value);
    }
    if (typeof value === 'object') {
      try {
        // Use the same safe JSON.stringify logic as formatToolInput
        return '(RAW)' + JSON.stringify(value);
      } catch (error) {
        return `[Object - serialization failed: ${String(value).substring(
          0,
          50
        )}...]`;
      }
    }
    return String(value);
  };

  const getToolStatusColor = (status: string) => {
    switch (status) {
      case 'done':
        return 'bg-green-500';
      case 'rejected-by-user':
      case 'blocked-on-user':
        return 'bg-yellow-500';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-blue-500';
    }
  };

  if (parsedLines.length === 0) {
    return (
      <Card>
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">
            No valid JSONL data found
          </p>
        </CardContent>
      </Card>
    );
  }

  const latestTokenUsage =
    conversation.tokenUsages[conversation.tokenUsages.length - 1];

  return (
    <div className="space-y-4">
      {/* Header with token usage */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4" />
          <span className="text-sm font-medium">LLM Conversation</span>
        </div>
        <div className="flex items-center gap-2">
          {latestTokenUsage && (
            <Badge variant="outline" className="text-xs">
              <Zap className="h-3 w-3 mr-1" />
              {latestTokenUsage.used.toLocaleString()} /{' '}
              {latestTokenUsage.maxAvailable.toLocaleString()} tokens
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowTokenUsage(!showTokenUsage)}
          >
            {showTokenUsage ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Token usage details */}
      {showTokenUsage && conversation.tokenUsages.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Token Usage Timeline</CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            <div className="space-y-1">
              {conversation.tokenUsages.map((usage, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="text-muted-foreground">
                    Step {index + 1}
                  </span>
                  <span>
                    {usage.used.toLocaleString()} /{' '}
                    {usage.maxAvailable.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Conversation items (messages and tool rejections) */}
      <div className="space-y-3">
        {conversation.items.map((item, index) => {
          if (item.type === 'parse-error') {
            return (
              <Card
                key={`error-${index}`}
                className="bg-yellow-100/50 dark:bg-yellow-900/20 border"
              >
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                    <Badge variant="secondary" className="text-xs">
                      Parse Error
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">
                      Raw JSONL:
                    </p>
                    <pre className="text-xs bg-background p-2 rounded border overflow-x-auto whitespace-pre-wrap">
                      {safeRenderString(item.rawLine)}
                    </pre>
                  </div>
                </CardContent>
              </Card>
            );
          }

          if (item.type === 'unknown') {
            let prettyJson = item.rawLine;
            try {
              prettyJson = JSON.stringify(
                JSON.parse(item.rawLine || '{}'),
                null,
                2
              );
            } catch {
              // Keep as is if can't prettify
            }

            return (
              <Card key={`unknown-${index}`} className="bg-muted/30 border">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <Badge variant="secondary" className="text-xs">
                      Unknown
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">JSONL:</p>
                    <pre className="text-xs bg-background p-2 rounded border overflow-x-auto whitespace-pre-wrap">
                      {safeRenderString(prettyJson)}
                    </pre>
                  </div>
                </CardContent>
              </Card>
            );
          }

          if (item.type === 'tool-rejection') {
            return (
              <Card
                key={`rejection-${index}`}
                className="bg-red-100/50 dark:bg-red-900/20 border"
              >
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                    <Badge variant="secondary" className="text-xs">
                      Tool Rejected
                    </Badge>
                    <span className="text-sm font-medium">
                      {safeRenderString(item.tool)}
                    </span>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">
                        Command:
                      </p>
                      <pre className="text-xs bg-background p-2 rounded border overflow-x-auto">
                        {safeRenderString(item.command)}
                      </pre>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">
                        Message:
                      </p>
                      <p className="text-xs bg-background p-2 rounded border">
                        {safeRenderString(item.message)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          }

          if (item.type === 'message') {
            const messageId = `message-${index}`;
            const isExpanded = expandedMessages.has(messageId);
            const hasThinking = item.content?.some(
              (c: any) => c.type === 'thinking'
            );

            return (
              <Card
                key={messageId}
                className={`${
                  item.role === 'user'
                    ? 'bg-blue-100/50 dark:bg-blue-900/20 border ml-12'
                    : 'bg-muted/50 border mr-12'
                }`}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-medium capitalize">
                      {item.role}
                    </span>
                    {item.timestamp && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {new Date(item.timestamp).toLocaleTimeString()}
                      </div>
                    )}
                    {hasThinking && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleMessage(messageId)}
                        className="h-6 px-2 text-xs"
                      >
                        {isExpanded ? (
                          <>
                            <ChevronUp className="h-3 w-3 mr-1" />
                            Hide thinking
                          </>
                        ) : (
                          <>
                            <ChevronDown className="h-3 w-3 mr-1" />
                            Show thinking
                          </>
                        )}
                      </Button>
                    )}
                  </div>

                  <div className="space-y-2">
                    {item.content?.map((content: any, contentIndex: number) => {
                      if (content.type === 'text') {
                        return (
                          <div
                            key={contentIndex}
                            className="prose prose-sm max-w-none"
                          >
                            <p className="text-sm whitespace-pre-wrap">
                              {safeRenderString(content.text)}
                            </p>
                          </div>
                        );
                      }

                      if (content.type === 'thinking' && isExpanded) {
                        return (
                          <div key={contentIndex} className="mt-3">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant="outline" className="text-xs">
                                💭 Thinking
                              </Badge>
                            </div>
                            <div className="text-xs text-muted-foreground italic whitespace-pre-wrap">
                              {safeRenderString(content.thinking)}
                            </div>
                          </div>
                        );
                      }

                      if (content.type === 'tool_use') {
                        return (
                          <div key={contentIndex} className="mt-3">
                            <div className="flex items-center gap-2 mb-2">
                              <Tool className="h-4 w-4 text-green-600 dark:text-green-400" />
                              <span className="text-sm font-medium">
                                {safeRenderString(content.name)}
                              </span>
                            </div>
                            {content.input && (
                              <pre className="text-xs bg-muted/50 p-2 rounded overflow-x-auto max-h-32">
                                {formatToolInput(content.input)}
                              </pre>
                            )}
                          </div>
                        );
                      }

                      if (content.type === 'tool_result') {
                        return (
                          <div key={contentIndex} className="mt-3">
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-4 h-4 flex items-center justify-center">
                                {content.run?.status ? (
                                  <div
                                    className={`w-2 h-2 rounded-full ${getToolStatusColor(
                                      content.run.status
                                    )}`}
                                  />
                                ) : content.is_error ? (
                                  <div className="w-2 h-2 rounded-full bg-red-500" />
                                ) : (
                                  <div className="w-2 h-2 rounded-full bg-green-500" />
                                )}
                              </div>
                              <span className="text-sm text-muted-foreground">
                                Result
                              </span>
                              {content.run?.status && (
                                <span className="text-xs text-muted-foreground">
                                  ({safeRenderString(content.run.status)})
                                </span>
                              )}
                              {content.is_error && (
                                <span className="text-xs text-red-500">
                                  (Error)
                                </span>
                              )}
                            </div>
                            {/* Amp format result */}
                            {content.run?.result && (
                              <pre className="text-xs bg-muted/50 p-2 rounded overflow-x-auto max-h-32">
                                {safeRenderString(content.run.result)}
                              </pre>
                            )}
                            {/* Claude format result */}
                            {content.content && !content.run && (
                              <pre className="text-xs bg-muted/50 p-2 rounded overflow-x-auto max-h-32">
                                {safeRenderString(content.content)}
                              </pre>
                            )}
                            {content.run?.toAllow && (
                              <div className="mt-2">
                                <p className="text-xs text-muted-foreground mb-1">
                                  Commands to allow:
                                </p>
                                <div className="flex flex-wrap gap-1">
                                  {content.run.toAllow.map(
                                    (cmd: string, i: number) => (
                                      <code
                                        key={i}
                                        className="text-xs bg-muted px-1 rounded"
                                      >
                                        {safeRenderString(cmd)}
                                      </code>
                                    )
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      }

                      return null;
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          }

          return null;
        })}
      </div>
    </div>
  );
}
