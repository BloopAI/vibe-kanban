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
import { useEventSource, useEventSourceListener } from '@react-nano/use-event-source';
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
  
  // Track highest batch ID for SSE resume functionality
  const highestBatchId = useRef(0);
  
  // Track previous process ID to detect changes
  const prevProcessId = useRef<string | null>(null);

  // SSE URL construction with resume cursor support
  const sseUrl = useMemo(() => {
    if (executionProcess.status !== 'running') return null;
    
    const baseUrl = `/api/projects/${projectId}/execution-processes/${executionProcess.id}/normalized-logs/stream`;
    return highestBatchId.current > 0 
      ? `${baseUrl}?since_batch_id=${highestBatchId.current}`
      : baseUrl;
  }, [executionProcess.id, executionProcess.status, projectId]);

  // Use the @react-nano/use-event-source hook for SSE
  const [eventSource, connectionStatus] = useEventSource(sseUrl || '');

  // Handle SSE connection events
  useEventSourceListener(eventSource, ['patch'], (event) => {
    try {
      const batchData = JSON.parse(event.data);
      const { batch_id, patches } = batchData;

      // Skip duplicates
      if (batch_id && batch_id <= highestBatchId.current) {
        debugLog(
          `⏭️ SSE: Skipping duplicate batch_id=${batch_id} (current=${highestBatchId.current})`
        );
        return;
      }

      // Update cursor BEFORE processing
      if (batch_id) {
        highestBatchId.current = batch_id;
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
            highestBatchId.current = batch_id - 1;
          }
          debugLog(`⚠️ SSE: Patch failure for batch_id=${batch_id}`);
          return prev || baseConversation;
        }
      });
    } catch (e) {
      console.warn('❌ SSE: Parse failed:', e);
    }
  }, [onConversationUpdate, debugLog]);

  // Handle connection status changes
  useEffect(() => {
    if (connectionStatus === 'open') {
      debugLog(`✅ SSE: Connected to ${executionProcess.id}`);
    } else if (connectionStatus === 'error') {
      console.warn(`🔌 SSE: Connection error for ${executionProcess.id}`);
    } else if (connectionStatus === 'closed') {
      debugLog(`🔌 SSE: Connection closed for ${executionProcess.id}`);
    }
  }, [connectionStatus, executionProcess.id, debugLog]);

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
    if (prevProcessId.current !== processId) {
      setConversation(null);
      setLoading(true);
      setError(null);
      highestBatchId.current = 0; // Reset batch ID cursor

      // Clear fetch tracking for old processes (keep memory bounded)
      if (fetchedProcesses.current.size > 10) {
        fetchedProcesses.current.clear();
      }
      
      prevProcessId.current = processId;
    }

    if (processStatus === 'running') {
      // Running processes: SSE will handle data (including initial state)
      debugLog(`🚀 Data: Using SSE for running process ${processId}`);
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
