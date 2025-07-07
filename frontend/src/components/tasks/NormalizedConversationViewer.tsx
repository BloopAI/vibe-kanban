import { useState, useEffect, useCallback } from 'react';
import {
  User,
  Bot,
  Eye,
  Edit,
  Terminal,
  Search,
  Globe,
  Plus,
  Settings,
  Brain,
  Hammer,
  AlertCircle,
  ChevronRight,
  ChevronUp,
} from 'lucide-react';
import { makeRequest } from '@/lib/api';
import type {
  NormalizedConversation,
  NormalizedEntryType,
  ExecutionProcess,
  ApiResponse,
} from 'shared/types';

interface NormalizedConversationViewerProps {
  executionProcess: ExecutionProcess;
  projectId: string;
  onConversationUpdate?: () => void;
}

const getEntryIcon = (entryType: NormalizedEntryType) => {
  if (entryType.type === 'user_message') {
    return <User className="h-4 w-4 text-blue-600" />;
  }
  if (entryType.type === 'assistant_message') {
    return <Bot className="h-4 w-4 text-green-600" />;
  }
  if (entryType.type === 'system_message') {
    return <Settings className="h-4 w-4 text-gray-600" />;
  }
  if (entryType.type === 'thinking') {
    return <Brain className="h-4 w-4 text-purple-600" />;
  }
  if (entryType.type === 'error_message') {
    return <AlertCircle className="h-4 w-4 text-red-600" />;
  }
  if (entryType.type === 'tool_use') {
    const { action_type } = entryType;
    if (action_type.action === 'file_read') {
      return <Eye className="h-4 w-4 text-orange-600" />;
    }
    if (action_type.action === 'file_write') {
      return <Edit className="h-4 w-4 text-red-600" />;
    }
    if (action_type.action === 'command_run') {
      return <Terminal className="h-4 w-4 text-yellow-600" />;
    }
    if (action_type.action === 'search') {
      return <Search className="h-4 w-4 text-indigo-600" />;
    }
    if (action_type.action === 'web_fetch') {
      return <Globe className="h-4 w-4 text-cyan-600" />;
    }
    if (action_type.action === 'task_create') {
      return <Plus className="h-4 w-4 text-teal-600" />;
    }
    return <Settings className="h-4 w-4 text-gray-600" />;
  }
  return <Settings className="h-4 w-4 text-gray-400" />;
};

const getContentClassName = (entryType: NormalizedEntryType) => {
  const baseClasses = 'text-sm whitespace-pre-wrap break-words';

  if (
    entryType.type === 'tool_use' &&
    entryType.action_type.action === 'command_run'
  ) {
    return `${baseClasses} font-mono`;
  }

  if (entryType.type === 'error_message') {
    return `${baseClasses} text-red-600 font-mono bg-red-50 dark:bg-red-950/20 px-2 py-1 rounded`;
  }

  return baseClasses;
};

export function NormalizedConversationViewer({
  executionProcess,
  projectId,
  onConversationUpdate,
}: NormalizedConversationViewerProps) {
  const [conversation, setConversation] =
    useState<NormalizedConversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedErrors, setExpandedErrors] = useState<Set<number>>(new Set());

  const toggleErrorExpansion = (index: number) => {
    setExpandedErrors((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const fetchNormalizedLogs = useCallback(
    async (isPolling = false) => {
      try {
        if (!isPolling) {
          setLoading(true);
          setError(null);
        }

        const response = await makeRequest(
          `/api/projects/${projectId}/execution-processes/${executionProcess.id}/normalized-logs`
        );

        if (response.ok) {
          const result: ApiResponse<NormalizedConversation> =
            await response.json();
          if (result.success && result.data) {
            setConversation((prev) => {
              // Only update if content actually changed
              if (
                !prev ||
                JSON.stringify(prev) !== JSON.stringify(result.data)
              ) {
                // Notify parent component of conversation update
                if (onConversationUpdate) {
                  // Use setTimeout to ensure state update happens first
                  setTimeout(onConversationUpdate, 0);
                }
                return result.data;
              }
              return prev;
            });
          } else if (!isPolling) {
            setError(result.message || 'Failed to fetch normalized logs');
          }
        } else if (!isPolling) {
          const errorText = await response.text();
          setError(`Failed to fetch logs: ${errorText || response.statusText}`);
        }
      } catch (err) {
        if (!isPolling) {
          setError(
            `Error fetching logs: ${err instanceof Error ? err.message : 'Unknown error'}`
          );
        }
      } finally {
        if (!isPolling) {
          setLoading(false);
        }
      }
    },
    [executionProcess.id, projectId, onConversationUpdate]
  );

  // Initial fetch
  useEffect(() => {
    fetchNormalizedLogs();
  }, [fetchNormalizedLogs]);

  // Auto-refresh every 2 seconds when process is running
  useEffect(() => {
    if (executionProcess.status === 'running') {
      const interval = setInterval(() => {
        fetchNormalizedLogs(true);
      }, 2000);

      return () => clearInterval(interval);
    }
  }, [executionProcess.status, fetchNormalizedLogs]);

  if (loading) {
    return (
      <div className="text-xs text-muted-foreground italic text-center">
        Loading conversation...
      </div>
    );
  }

  if (error) {
    return <div className="text-xs text-red-600 text-center">{error}</div>;
  }

  if (!conversation || conversation.entries.length === 0) {
    // If the execution process is still running, show loading instead of "no data"
    if (executionProcess.status === 'running') {
      return (
        <div className="text-xs text-muted-foreground italic text-center">
          Waiting for logs...
        </div>
      );
    }

    return (
      <div className="text-xs text-muted-foreground italic text-center">
        No conversation data available
      </div>
    );
  }

  return (
    <div>
      {/* Display prompt if available */}
      {conversation.prompt && (
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-1">
            <Hammer className="h-4 w-4 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm whitespace-pre-wrap text-foreground">
              {conversation.prompt}
            </div>
          </div>
        </div>
      )}

      {/* Display conversation entries */}
      <div className="space-y-2">
        {conversation.entries.map((entry, index) => {
          const isErrorMessage = entry.entry_type.type === 'error_message';
          const isExpanded = expandedErrors.has(index);
          const hasMultipleLines =
            isErrorMessage && entry.content.includes('\n');

          return (
            <div key={index} className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-1">
                {isErrorMessage && hasMultipleLines ? (
                  <button
                    onClick={() => toggleErrorExpansion(index)}
                    className="transition-colors hover:opacity-70"
                  >
                    {getEntryIcon(entry.entry_type)}
                  </button>
                ) : (
                  getEntryIcon(entry.entry_type)
                )}
              </div>
              <div className="flex-1 min-w-0">
                {isErrorMessage && hasMultipleLines ? (
                  <div className={isExpanded ? 'space-y-2' : ''}>
                    <div className={getContentClassName(entry.entry_type)}>
                      {isExpanded ? (
                        entry.content
                      ) : (
                        <>
                          {entry.content.split('\n')[0]}
                          <button
                            onClick={() => toggleErrorExpansion(index)}
                            className="ml-2 inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors"
                          >
                            <ChevronRight className="h-3 w-3" />
                            Show more
                          </button>
                        </>
                      )}
                    </div>
                    {isExpanded && (
                      <button
                        onClick={() => toggleErrorExpansion(index)}
                        className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors"
                      >
                        <ChevronUp className="h-3 w-3" />
                        Show less
                      </button>
                    )}
                  </div>
                ) : (
                  <div className={getContentClassName(entry.entry_type)}>
                    {entry.content}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
