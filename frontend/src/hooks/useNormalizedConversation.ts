import {
  TaskAttemptDataContext,
  TaskDetailsContext,
} from '@/components/context/taskDetailsContext';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { applyPatch } from 'fast-json-patch';
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ExecutionProcess,
  NormalizedConversation,
  NormalizedEntry,
} from 'shared/types';

const useNormalizedConversation = ({
  executionProcess,
  onConversationUpdate,
  onDisplayEntriesChange,
  visibleEntriesNum,
}: {
  executionProcess?: ExecutionProcess;
  onConversationUpdate?: () => void;
  onDisplayEntriesChange?: (num: number) => void;
  visibleEntriesNum?: number;
}) => {
  const { projectId } = useContext(TaskDetailsContext);
  const { attemptData } = useContext(TaskAttemptDataContext);

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
    onopenCalled: boolean;
  }>({
    abortController: null,
    isActive: false,
    highestBatchId: 0,
    reconnectAttempts: 0,
    reconnectTimeout: null,
    processId: executionProcess?.id || '',
    processStatus: executionProcess?.status || '',
    patchFailureCount: 0,
    onopenCalled: false,
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
          const manager = sseManagerRef.current;
          if (manager.onopenCalled) {
            // This is a "phantom" reconnect, so abort and re-create
            debugLog(
              '⚠️ SSE: onopen called again for same connection, forcing reconnect'
            );
            abortController.abort();
            manager.abortController = null;
            manager.isActive = false;
            manager.onopenCalled = false;
            // Re-establish with latest cursor
            scheduleReconnect(processId, projectId);
            return;
          }
          manager.onopenCalled = true;
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
    manager.onopenCalled = false;
  }, []);

  // Process-based data fetching - fetch once from appropriate source
  useEffect(() => {
    if (!executionProcess?.id || !executionProcess?.status) {
      return;
    }
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
      const logs = attemptData.allLogs.find(
        (entry) => entry.id === executionProcess.id
      )?.normalized_conversation;
      if (logs) {
        setConversation((prev) => {
          // Only update if content actually changed - use lightweight comparison
          if (
            !prev ||
            prev.entries.length !== logs.entries.length ||
            prev.prompt !== logs.prompt
          ) {
            // Notify parent component of conversation update
            if (onConversationUpdate) {
              // Use setTimeout to ensure state update happens first
              setTimeout(onConversationUpdate, 0);
            }
            return logs;
          }
          return prev;
        });
      }
      setLoading(false);
    }
  }, [
    executionProcess?.id,
    executionProcess?.status,
    attemptData.allLogs,
    debugLog,
    onConversationUpdate,
  ]);

  // SSE connection management for running processes only
  useEffect(() => {
    if (!executionProcess?.id || !executionProcess?.status) {
      return;
    }
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
  }, [executionProcess?.id, executionProcess?.status]);

  // Memoize display entries to avoid unnecessary re-renders
  const displayEntries = useMemo(() => {
    if (!conversation?.entries) return [];

    // Filter out any null entries that may have been created by duplicate patch application
    const displayEntries = conversation.entries.filter(
      (entry): entry is NormalizedEntry =>
        Boolean(entry && (entry as NormalizedEntry).entry_type)
    );
    onDisplayEntriesChange?.(displayEntries.length);
    if (visibleEntriesNum && displayEntries.length > visibleEntriesNum) {
      return displayEntries.slice(-visibleEntriesNum);
    }

    return displayEntries;
  }, [conversation?.entries, onDisplayEntriesChange, visibleEntriesNum]);

  return {
    displayEntries,
    conversation,
    loading,
    error,
  };
};

export default useNormalizedConversation;
