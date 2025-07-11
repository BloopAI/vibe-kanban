import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Bot, Hammer, ToggleLeft, ToggleRight } from 'lucide-react';
import { makeRequest } from '@/lib/api.ts';
import { MarkdownRenderer } from '@/components/ui/markdown-renderer.tsx';
import type {
  ApiResponse,
  ExecutionProcess,
  NormalizedConversation,
  NormalizedEntry,
  WorktreeDiff,
} from 'shared/types.ts';
import { TaskDetailsContext } from '@/components/context/taskDetailsContext.ts';
import DisplayConversationEntry from '@/components/tasks/TaskDetails/DisplayConversationEntry.tsx';

interface NormalizedConversationViewerProps {
  executionProcess: ExecutionProcess;
  onConversationUpdate?: () => void;
  diff?: WorktreeDiff | null;
  isBackgroundRefreshing?: boolean;
  diffDeletable?: boolean;
}

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

export function NormalizedConversationViewer({
  executionProcess,
  diffDeletable,
  onConversationUpdate,
}: NormalizedConversationViewerProps) {
  const { projectId } = useContext(TaskDetailsContext);
  const [conversation, setConversation] =
    useState<NormalizedConversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clusteringEnabled, setClusteringEnabled] = useState(
    GEMINI_CLUSTERING_CONFIG.enabled
  );

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

  // Apply clustering for Gemini executor conversations
  const isGeminiExecutor = useMemo(
    () => conversation?.executor_type === 'gemini',
    [conversation?.executor_type]
  );
  const hasAssistantMessages = useMemo(
    () =>
      conversation?.entries.some(
        (entry) => entry.entry_type.type === 'assistant_message'
      ),
    [conversation?.entries]
  );
  const displayEntries = useMemo(
    () =>
      isGeminiExecutor && conversation?.entries
        ? clusterGeminiMessages(conversation.entries, clusteringEnabled)
        : conversation?.entries || [],
    [isGeminiExecutor, conversation?.entries, clusteringEnabled]
  );

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
        {displayEntries.map((entry, index) => (
          <DisplayConversationEntry
            key={index}
            entry={entry}
            index={index}
            diffDeletable={diffDeletable}
          />
        ))}
      </div>
    </div>
  );
}
