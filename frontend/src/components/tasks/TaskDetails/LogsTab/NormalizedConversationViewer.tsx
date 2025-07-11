import {
  useCallback,
  useContext,
  useEffect,
  useState,
  useMemo,
  useRef,
} from 'react';
import { Hammer } from 'lucide-react';
import { Loader } from '@/components/ui/loader.tsx';
import { executionProcessesApi } from '@/lib/api.ts';
import MarkdownRenderer from '@/components/ui/markdown-renderer.tsx';
import { applyPatch } from 'fast-json-patch';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import type {
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

export function NormalizedConversationViewer({
  executionProcess,
  diffDeletable,
  onConversationUpdate,
}: NormalizedConversationViewerProps) {
  const { projectId } = useContext(TaskDetailsContext);

  // Development-only logging helper
  const debugLog = useCallback((message: string, ...args: any[]) => {
    if (import.meta.env.DEV) {
      console.log(message, ...args);
    }
  }, []);

  const [conversation, setConversation] =
    useState<NormalizedConversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Track fetched processes to prevent redundant database calls
  const fetchedProcesses = useRef(new Set<string>());

  // SSE Connection Manager - production-ready with reconnection and resilience
  const sseManagerRef = useRef<{
    abortController: AbortController | null;
    isActive: boolean;
    highestBatchId: number;
    reconnectAttempts: number;
    reconnectTimeout: number | null;
    processId: string;
    processStatus: string;
    patchFailureCount: number;
  }>({
    abortController: null,
    isActive: false,
    highestBatchId: 0,
    reconnectAttempts: 0,
    reconnectTimeout: null,
    processId: executionProcess.id,
    processStatus: executionProcess.status,
    patchFailureCount: 0,
  });

  // SSE Connection Manager with Production-Ready Resilience using fetch-event-source
  const createSSEConnection = useCallback(
    (processId: string, projectId: string): AbortController => {
      const manager = sseManagerRef.current;
      // Build URL with resume cursor if we have processed batches
      const baseUrl = `/api/projects/${projectId}/execution-processes/${processId}/normalized-logs/stream`;
      const url =
        manager.highestBatchId > 0
          ? `${baseUrl}?since_batch_id=${manager.highestBatchId}`
          : baseUrl;
      debugLog(
        `🚀 SSE: Creating connection for process ${processId} (cursor: ${manager.highestBatchId})`
      );

      const abortController = new AbortController();

      fetchEventSource(url, {
        signal: abortController.signal,
        onopen: async (response) => {
          if (response.ok) {
            debugLog(`✅ SSE: Connected to ${processId}`);
            manager.isActive = true;
            manager.reconnectAttempts = 0; // Reset on successful connection
            manager.patchFailureCount = 0; // Reset patch failure count

            if (manager.reconnectTimeout) {
              clearTimeout(manager.reconnectTimeout);
              manager.reconnectTimeout = null;
            }
          } else {
            throw new Error(`SSE connection failed: ${response.status}`);
          }
        },
        onmessage: (event) => {
          if (event.event === 'patch') {
            try {
              const batchData = JSON.parse(event.data);
              const { batch_id, patches } = batchData;

              // Skip duplicates - use manager's batch tracking
              if (batch_id && batch_id <= manager.highestBatchId) {
                debugLog(
                  `⏭️ SSE: Skipping duplicate batch_id=${batch_id} (current=${manager.highestBatchId})`
                );
                return;
              }

              // Update cursor BEFORE processing
              if (batch_id) {
                manager.highestBatchId = batch_id;
                debugLog(`📍 SSE: Processing batch_id=${batch_id}`);
              }

              setConversation((prev) => {
                // Create empty conversation if none exists
                const baseConversation = prev || {
                  entries: [],
                  session_id: null,
                  executor_type: 'unknown',
                  prompt: null,
                  summary: null,
                };

                try {
                  const updated = applyPatch(
                    JSON.parse(JSON.stringify(baseConversation)),
                    patches
                  ).newDocument as NormalizedConversation;

                  updated.entries = updated.entries.filter(Boolean);

                  debugLog(
                    `🔧 SSE: Applied batch_id=${batch_id}, entries: ${updated.entries.length}`
                  );

                  // Reset patch failure count on successful application
                  manager.patchFailureCount = 0;

                  // Clear loading state on first successful patch
                  if (!prev) {
                    setLoading(false);
                    setError(null);
                  }

                  if (onConversationUpdate) {
                    setTimeout(onConversationUpdate, 0);
                  }

                  return updated;
                } catch (patchError) {
                  console.warn('❌ SSE: Patch failed:', patchError);
                  // Reset cursor on failure for potential retry
                  if (batch_id && batch_id > 0) {
                    manager.highestBatchId = batch_id - 1;
                  }
                  // Track patch failures for monitoring
                  manager.patchFailureCount++;
                  debugLog(
                    `⚠️ SSE: Patch failure #${manager.patchFailureCount} for batch_id=${batch_id}`
                  );
                  return prev || baseConversation;
                }
              });
            } catch (e) {
              console.warn('❌ SSE: Parse failed:', e);
            }
          }
        },
        onerror: (err) => {
          console.warn(`🔌 SSE: Connection error for ${processId}:`, err);
          manager.isActive = false;

          // Only attempt reconnection if process is still running
          if (manager.processStatus === 'running') {
            scheduleReconnect(processId, projectId);
          }
        },
        onclose: () => {
          debugLog(`🔌 SSE: Connection closed for ${processId}`);
          manager.isActive = false;
        },
      }).catch((error) => {
        if (error.name !== 'AbortError') {
          console.warn(`❌ SSE: Fetch error for ${processId}:`, error);
          manager.isActive = false;

          // Only attempt reconnection if process is still running
          if (manager.processStatus === 'running') {
            scheduleReconnect(processId, projectId);
          }
        }
      });

      return abortController;
    },
    [onConversationUpdate, debugLog]
  );

  const scheduleReconnect = useCallback(
    (processId: string, projectId: string) => {
      const manager = sseManagerRef.current;

      // Clear any existing reconnection timeout
      if (manager.reconnectTimeout) {
        clearTimeout(manager.reconnectTimeout);
      }

      // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
      const delay = Math.min(
        1000 * Math.pow(2, manager.reconnectAttempts),
        30000
      );
      manager.reconnectAttempts++;

      debugLog(
        `🔄 SSE: Scheduling reconnect attempt ${manager.reconnectAttempts} in ${delay}ms`
      );

      manager.reconnectTimeout = window.setTimeout(() => {
        if (manager.processStatus === 'running') {
          debugLog(`🔄 SSE: Attempting reconnect for ${processId}`);
          establishSSEConnection(processId, projectId);
        }
      }, delay);
    },
    [debugLog]
  );

  const establishSSEConnection = useCallback(
    (processId: string, projectId: string) => {
      const manager = sseManagerRef.current;

      // Close existing connection if any
      if (manager.abortController) {
        manager.abortController.abort();
        manager.abortController = null;
        manager.isActive = false;
      }

      const abortController = createSSEConnection(processId, projectId);
      manager.abortController = abortController;

      return abortController;
    },
    [createSSEConnection]
  );

  // Helper functions for SSE manager
  const setProcessId = (id: string) => {
    sseManagerRef.current.processId = id;
  };
  const setProcessStatus = (status: string) => {
    sseManagerRef.current.processStatus = status;
  };

  // Consolidated cleanup function to avoid duplication
  const cleanupSSEConnection = useCallback(() => {
    const manager = sseManagerRef.current;

    if (manager.abortController) {
      manager.abortController.abort();
      manager.abortController = null;
      manager.isActive = false;
    }

    if (manager.reconnectTimeout) {
      clearTimeout(manager.reconnectTimeout);
      manager.reconnectTimeout = null;
    }
  }, []);

  const fetchNormalizedLogsOnce = useCallback(
    async (processId: string) => {
      // Only fetch if not already fetched for this process
      if (fetchedProcesses.current.has(processId)) {
        debugLog(`📋 DB: Already fetched ${processId}, skipping`);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        debugLog(`📋 DB: Fetching logs for ${processId}`);

        const result = await executionProcessesApi.getNormalizedLogs(
          projectId,
          processId
        );

        // Mark as fetched
        fetchedProcesses.current.add(processId);

        setConversation((prev) => {
          // Only update if content actually changed - use lightweight comparison
          if (
            !prev ||
            prev.entries.length !== result.entries.length ||
            prev.prompt !== result.prompt
          ) {
            // Notify parent component of conversation update
            if (onConversationUpdate) {
              // Use setTimeout to ensure state update happens first
              setTimeout(onConversationUpdate, 0);
            }
            return result;
          }
          return prev;
        });
      } catch (err) {
        // Remove from fetched set on error to allow retry
        fetchedProcesses.current.delete(processId);
        setError(
          `Error fetching logs: ${err instanceof Error ? err.message : 'Unknown error'}`
        );
      } finally {
        setLoading(false);
      }
    },
    [projectId, onConversationUpdate, debugLog]
  );

  // Process-based data fetching - fetch once from appropriate source
  useEffect(() => {
    const processId = executionProcess.id;
    const processStatus = executionProcess.status;

    debugLog(`🎯 Data: Process ${processId} is ${processStatus}`);

    // Reset conversation state when switching processes
    const manager = sseManagerRef.current;
    if (manager.processId !== processId) {
      setConversation(null);
      setLoading(true);
      setError(null);

      // Clear fetch tracking for old processes (keep memory bounded)
      if (fetchedProcesses.current.size > 10) {
        fetchedProcesses.current.clear();
      }
    }

    if (processStatus === 'running') {
      // Running processes: SSE will handle data (including initial state)
      debugLog(`🚀 Data: Using SSE for running process ${processId}`);
      // SSE connection will be established by the SSE management effect
    } else {
      // Completed processes: Single database fetch
      debugLog(`📋 Data: Using database for completed process ${processId}`);
      fetchNormalizedLogsOnce(processId);
    }
  }, [
    executionProcess.id,
    executionProcess.status,
    fetchNormalizedLogsOnce,
    debugLog,
  ]);

  // SSE connection management for running processes only
  useEffect(() => {
    const processId = executionProcess.id;
    const processStatus = executionProcess.status;
    const manager = sseManagerRef.current;

    // Update manager state
    setProcessId(processId);
    setProcessStatus(processStatus);

    // Only establish SSE for running processes
    if (processStatus !== 'running') {
      debugLog(
        `🚫 SSE: Process ${processStatus}, cleaning up any existing connection`
      );
      cleanupSSEConnection();
      return;
    }

    // Check if connection already exists for same process ID
    if (manager.abortController && manager.processId === processId) {
      debugLog(`⚠️  SSE: Connection already exists for ${processId}, reusing`);
      return;
    }

    // Process changed - close existing and reset state
    if (manager.abortController && manager.processId !== processId) {
      debugLog(`🔄 SSE: Switching from ${manager.processId} to ${processId}`);
      cleanupSSEConnection();
      manager.highestBatchId = 0; // Reset cursor for new process
      manager.reconnectAttempts = 0;
      manager.patchFailureCount = 0; // Reset failure count for new process
    }

    // Update manager state
    manager.processId = processId;
    manager.processStatus = processStatus;

    // Establish new connection
    establishSSEConnection(processId, projectId);

    return () => {
      debugLog(`🔌 SSE: Cleanup connection for ${processId}`);

      // Close connection if it belongs to this effect
      if (manager.abortController && manager.processId === processId) {
        cleanupSSEConnection();
      }
    };
  }, [executionProcess.id, executionProcess.status]);

  // Memoize display entries to avoid unnecessary re-renders
  const displayEntries = useMemo(() => {
    if (!conversation?.entries) return [];

    // Filter out any null entries that may have been created by duplicate patch application
    return conversation.entries.filter((entry): entry is NormalizedEntry =>
      Boolean(entry && (entry as NormalizedEntry).entry_type)
    );
  }, [conversation?.entries]);

  if (loading) {
    return (
      <Loader message="Loading conversation..." size={24} className="py-4" />
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
            key={entry.timestamp || index}
            entry={entry}
            index={index}
            diffDeletable={diffDeletable}
          />
        ))}
      </div>
    </div>
  );
}
