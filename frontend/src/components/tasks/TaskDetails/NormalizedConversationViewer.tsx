import { useCallback, useContext, useEffect, useState } from 'react';
import {
  AlertCircle,
  Bot,
  Brain,
  CheckSquare,
  ChevronRight,
  ChevronUp,
  Edit,
  Eye,
  Globe,
  Hammer,
  Plus,
  Search,
  Settings,
  Terminal,
  ToggleLeft,
  ToggleRight,
  User,
} from 'lucide-react';
import { makeRequest } from '@/lib/api.ts';
import { MarkdownRenderer } from '@/components/ui/markdown-renderer.tsx';
import { DiffCard } from './DiffCard.tsx';
import type {
  ApiResponse,
  ExecutionProcess,
  NormalizedConversation,
  NormalizedEntry,
  NormalizedEntryType,
  WorktreeDiff,
} from 'shared/types.ts';
import { TaskDetailsContext } from '@/components/context/taskDetailsContext.ts';

interface NormalizedConversationViewerProps {
  executionProcess: ExecutionProcess;
  onConversationUpdate?: () => void;
  diff?: WorktreeDiff | null;
  isBackgroundRefreshing?: boolean;
  diffDeletable?: boolean;
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
    const { action_type, tool_name } = entryType;

    // Special handling for TODO tools
    if (
      tool_name &&
      (tool_name.toLowerCase() === 'todowrite' ||
        tool_name.toLowerCase() === 'todoread' ||
        tool_name.toLowerCase() === 'todo_write' ||
        tool_name.toLowerCase() === 'todo_read')
    ) {
      return <CheckSquare className="h-4 w-4 text-purple-600" />;
    }

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

  // Special styling for TODO lists
  if (
    entryType.type === 'tool_use' &&
    entryType.tool_name &&
    (entryType.tool_name.toLowerCase() === 'todowrite' ||
      entryType.tool_name.toLowerCase() === 'todoread' ||
      entryType.tool_name.toLowerCase() === 'todo_write' ||
      entryType.tool_name.toLowerCase() === 'todo_read')
  ) {
    return `${baseClasses} font-mono text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/20 px-2 py-1 rounded`;
  }

  return baseClasses;
};

// Configuration for Gemini message clustering
const GEMINI_CLUSTERING_CONFIG = {
  enabled: true,
  maxClusterSize: 5000, // Maximum characters per cluster
  maxClusterCount: 50, // Maximum number of messages to cluster together
  minClusterSize: 2, // Minimum number of messages to consider clustering
};

/**
 * Utility function to cluster adjacent assistant messages for Gemini executor.
 *
 * This function merges consecutive assistant messages into larger chunks to improve
 * readability while preserving the progressive nature of Gemini's output.
 *
 * Clustering rules:
 * - Only assistant messages are clustered together
 * - Non-assistant messages (errors, tool use, etc.) break clustering
 * - Clusters are limited by size (characters) and count (number of messages)
 * - Requires minimum of 2 messages to form a cluster
 * - Original content and formatting is preserved
 *
 * @param entries - Original conversation entries
 * @param enabled - Whether clustering is enabled
 * @returns - Processed entries with clustering applied
 */
const clusterGeminiMessages = (
  entries: NormalizedEntry[],
  enabled: boolean
): NormalizedEntry[] => {
  if (!enabled) {
    return entries;
  }

  const clustered: NormalizedEntry[] = [];
  let currentCluster: NormalizedEntry[] = [];

  const flushCluster = () => {
    if (currentCluster.length === 0) return;

    if (currentCluster.length < GEMINI_CLUSTERING_CONFIG.minClusterSize) {
      // Not enough messages to cluster, add them individually
      clustered.push(...currentCluster);
    } else {
      // Merge multiple messages into one
      // Join with newlines to preserve message boundaries and readability
      const mergedContent = currentCluster
        .map((entry) => entry.content)
        .join('\n');

      const mergedEntry: NormalizedEntry = {
        timestamp: currentCluster[0].timestamp, // Use timestamp of first message
        entry_type: currentCluster[0].entry_type,
        content: mergedContent,
      };
      clustered.push(mergedEntry);
    }
    currentCluster = [];
  };

  for (const entry of entries) {
    const isAssistantMessage = entry.entry_type.type === 'assistant_message';

    if (isAssistantMessage) {
      // Check if we can add to current cluster
      const wouldExceedSize =
        currentCluster.length > 0 &&
        currentCluster.map((e) => e.content).join('').length +
          entry.content.length >
          GEMINI_CLUSTERING_CONFIG.maxClusterSize;
      const wouldExceedCount =
        currentCluster.length >= GEMINI_CLUSTERING_CONFIG.maxClusterCount;

      if (wouldExceedSize || wouldExceedCount) {
        // Flush current cluster and start new one
        flushCluster();
      }

      currentCluster.push(entry);
    } else {
      // Non-assistant message, flush current cluster and add this message separately
      flushCluster();
      clustered.push(entry);
    }
  }

  // Flush any remaining cluster
  flushCluster();

  return clustered;
};

// Helper function to determine if a tool call modifies files
const isFileModificationToolCall = (
  entryType: NormalizedEntryType
): boolean => {
  if (entryType.type !== 'tool_use') {
    return false;
  }

  // Check for direct file write action
  if (entryType.action_type.action === 'file_write') {
    return true;
  }

  // Check for "other" actions that are file modification tools
  if (entryType.action_type.action === 'other') {
    const fileModificationTools = [
      'edit',
      'write',
      'create_file',
      'multiedit',
      'edit_file',
    ];
    return fileModificationTools.includes(
      entryType.tool_name?.toLowerCase() || ''
    );
  }

  return false;
};

// Extract file path from tool call
const extractFilePathFromToolCall = (entry: NormalizedEntry): string | null => {
  if (entry.entry_type.type !== 'tool_use') {
    return null;
  }

  const { action_type, tool_name } = entry.entry_type;

  // Direct path extraction from action_type
  if (action_type.action === 'file_write') {
    return action_type.path || null;
  }

  // For "other" actions, check if it's a known file modification tool
  if (action_type.action === 'other') {
    const fileModificationTools = [
      'edit',
      'write',
      'create_file',
      'multiedit',
      'edit_file',
    ];

    if (fileModificationTools.includes(tool_name.toLowerCase())) {
      // Parse file path from content field
      return parseFilePathFromContent(entry.content);
    }
  }

  return null;
};

// Parse file path from content (handles various formats)
const parseFilePathFromContent = (content: string): string | null => {
  // Try to extract path from backticks: `path/to/file.ext`
  const backtickMatch = content.match(/`([^`]+)`/);
  if (backtickMatch) {
    return backtickMatch[1];
  }

  // Try to extract from common patterns like "Edit file: path" or "Write file: path"
  const actionMatch = content.match(
    /(?:Edit|Write|Create)\s+file:\s*([^\s\n]+)/i
  );
  if (actionMatch) {
    return actionMatch[1];
  }

  return null;
};

// Create filtered diff showing only specific files
const createIncrementalDiff = (
  fullDiff: WorktreeDiff | null,
  targetFilePaths: string[]
): WorktreeDiff | null => {
  if (!fullDiff || targetFilePaths.length === 0) {
    return null;
  }

  // Filter files to only include the target file paths
  const filteredFiles = fullDiff.files.filter((file) =>
    targetFilePaths.some(
      (targetPath) =>
        file.path === targetPath ||
        file.path.endsWith('/' + targetPath) ||
        targetPath.endsWith('/' + file.path)
    )
  );

  if (filteredFiles.length === 0) {
    return null;
  }

  return {
    ...fullDiff,
    files: filteredFiles,
  };
};

// Helper function to determine if content should be rendered as markdown
const shouldRenderMarkdown = (entryType: NormalizedEntryType) => {
  // Render markdown for assistant messages and tool outputs that contain backticks
  return (
    entryType.type === 'assistant_message' ||
    (entryType.type === 'tool_use' &&
      entryType.tool_name &&
      (entryType.tool_name.toLowerCase() === 'todowrite' ||
        entryType.tool_name.toLowerCase() === 'todoread' ||
        entryType.tool_name.toLowerCase() === 'todo_write' ||
        entryType.tool_name.toLowerCase() === 'todo_read' ||
        entryType.tool_name.toLowerCase() === 'glob' ||
        entryType.tool_name.toLowerCase() === 'ls' ||
        entryType.tool_name.toLowerCase() === 'list_directory' ||
        entryType.tool_name.toLowerCase() === 'read' ||
        entryType.tool_name.toLowerCase() === 'read_file' ||
        entryType.tool_name.toLowerCase() === 'write' ||
        entryType.tool_name.toLowerCase() === 'create_file' ||
        entryType.tool_name.toLowerCase() === 'edit' ||
        entryType.tool_name.toLowerCase() === 'edit_file' ||
        entryType.tool_name.toLowerCase() === 'multiedit' ||
        entryType.tool_name.toLowerCase() === 'bash' ||
        entryType.tool_name.toLowerCase() === 'run_command' ||
        entryType.tool_name.toLowerCase() === 'grep' ||
        entryType.tool_name.toLowerCase() === 'search' ||
        entryType.tool_name.toLowerCase() === 'webfetch' ||
        entryType.tool_name.toLowerCase() === 'web_fetch' ||
        entryType.tool_name.toLowerCase() === 'task'))
  );
};

export function NormalizedConversationViewer({
  executionProcess,
  diffDeletable,
  onConversationUpdate,
}: NormalizedConversationViewerProps) {
  const { projectId, diff } = useContext(TaskDetailsContext);
  const [conversation, setConversation] =
    useState<NormalizedConversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedErrors, setExpandedErrors] = useState<Set<number>>(new Set());
  const [clusteringEnabled, setClusteringEnabled] = useState(
    GEMINI_CLUSTERING_CONFIG.enabled
  );

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

  // Apply clustering for Gemini executor conversations
  const isGeminiExecutor = conversation.executor_type === 'gemini';
  const hasAssistantMessages = conversation.entries.some(
    (entry) => entry.entry_type.type === 'assistant_message'
  );
  const displayEntries = isGeminiExecutor
    ? clusterGeminiMessages(conversation.entries, clusteringEnabled)
    : conversation.entries;

  return (
    <div>
      {/* Display clustering controls for Gemini */}
      {isGeminiExecutor && hasAssistantMessages && (
        <div className="mb-4 p-2 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-blue-700 dark:text-blue-300">
              <Bot className="h-3 w-3" />
              <span>
                {clusteringEnabled &&
                displayEntries.length !== conversation.entries.length
                  ? `Messages clustered for better readability (${conversation.entries.length} → ${displayEntries.length} messages)`
                  : 'Gemini message clustering'}
              </span>
            </div>
            <button
              onClick={() => setClusteringEnabled(!clusteringEnabled)}
              className="flex items-center gap-1 text-xs text-blue-700 dark:text-blue-300 hover:text-blue-800 dark:hover:text-blue-200 transition-colors"
              title={
                clusteringEnabled
                  ? 'Disable message clustering'
                  : 'Enable message clustering'
              }
            >
              {clusteringEnabled ? (
                <ToggleRight className="h-4 w-4" />
              ) : (
                <ToggleLeft className="h-4 w-4" />
              )}
              <span>{clusteringEnabled ? 'ON' : 'OFF'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Display prompt if available */}
      {conversation.prompt && (
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-1">
            <Hammer className="h-4 w-4 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm whitespace-pre-wrap text-foreground">
              <MarkdownRenderer
                content={conversation.prompt}
                className="whitespace-pre-wrap break-words"
              />
            </div>
          </div>
        </div>
      )}

      {/* Display conversation entries */}
      <div className="space-y-2">
        {displayEntries.map((entry, index) => {
          const isErrorMessage = entry.entry_type.type === 'error_message';
          const isExpanded = expandedErrors.has(index);
          const hasMultipleLines =
            isErrorMessage && entry.content.includes('\n');
          const isFileModification = isFileModificationToolCall(
            entry.entry_type
          );

          // Extract file path from this specific tool call
          const modifiedFilePath = isFileModification
            ? extractFilePathFromToolCall(entry)
            : null;

          // Create incremental diff showing only the files modified by this specific tool call
          const incrementalDiff =
            modifiedFilePath && diff
              ? createIncrementalDiff(diff, [modifiedFilePath])
              : null;

          // Show incremental diff for this specific file modification
          const shouldShowDiff =
            isFileModification &&
            incrementalDiff &&
            incrementalDiff.files.length > 0;

          return (
            <div key={index}>
              <div className="flex items-start gap-3">
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
                          shouldRenderMarkdown(entry.entry_type) ? (
                            <MarkdownRenderer
                              content={entry.content}
                              className="whitespace-pre-wrap break-words"
                            />
                          ) : (
                            entry.content
                          )
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
                      {shouldRenderMarkdown(entry.entry_type) ? (
                        <MarkdownRenderer
                          content={entry.content}
                          className="whitespace-pre-wrap break-words"
                        />
                      ) : (
                        entry.content
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Render incremental diff card inline after file modification entries */}
              {shouldShowDiff && incrementalDiff && (
                <div className="mt-4 mb-2">
                  <DiffCard
                    diff={incrementalDiff}
                    deletable={diffDeletable}
                    compact={true}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
