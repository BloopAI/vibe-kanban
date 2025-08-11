import {
  useContext,
  useState,
  useRef,
  useCallback,
  useMemo,
  useEffect,
} from 'react';
import { Virtuoso } from 'react-virtuoso';
import { Cog } from 'lucide-react';
import {
  TaskAttemptDataContext,
  TaskSelectedAttemptContext,
} from '@/components/context/taskDetailsContext.ts';
import { useProcessesLogs } from '@/hooks/useProcessesLogs';
import LogEntryRow from '@/components/logs/LogEntryRow';
import {
  shouldShowInLogs,
  isAutoCollapsibleProcess,
  isProcessCompleted,
  isCodingAgent,
  getLatestCodingAgent,
  PROCESS_STATUSES,
} from '@/constants/processes';
import type { ExecutionProcessStatus } from 'shared/types';

function LogsTab() {
  const { attemptData } = useContext(TaskAttemptDataContext);
  const { selectedAttempt } = useContext(TaskSelectedAttemptContext);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [userCollapsedProcesses, setUserCollapsedProcesses] = useState<
    Set<string>
  >(new Set());
  const [autoCollapsedProcesses, setAutoCollapsedProcesses] = useState<
    Set<string>
  >(new Set());
  const virtuosoRef = useRef<any>(null);

  // Refs for efficient status tracking
  const prevStatusRef = useRef<Map<string, ExecutionProcessStatus>>(new Map());
  const autoCollapsedOnceRef = useRef<Set<string>>(new Set());
  const currentAttemptIdRef = useRef<string | null>(null);
  
  // Refs for coding agent auto-collapse tracking
  const prevLatestAgentIdRef = useRef<string | null>(null);
  const seenRunningRef = useRef<Set<string>>(new Set());
  const initialAgentsCollapsedRef = useRef<boolean>(false);

  // Filter out dev server processes before passing to useProcessesLogs
  const filteredProcesses = useMemo(
    () =>
      (attemptData.processes || []).filter((process) =>
        shouldShowInLogs(process.run_reason)
      ),
    [attemptData.processes]
  );

  const { entries } = useProcessesLogs(filteredProcesses, true);

  // Combined collapsed processes (auto + user)
  const allCollapsedProcesses = useMemo(() => {
    const combined = new Set(autoCollapsedProcesses);
    userCollapsedProcesses.forEach((id) => combined.add(id));
    return combined;
  }, [autoCollapsedProcesses, userCollapsedProcesses]);

  // Toggle collapsed state for a process (user action)
  const toggleProcessCollapse = useCallback(
    (processId: string) => {
      const wasAtBottom = isAtBottom;
      setUserCollapsedProcesses((prev) => {
        const next = new Set(prev);
        if (next.has(processId)) {
          next.delete(processId);
        } else {
          next.add(processId);
        }
        return next;
      });

      // Remove from auto-collapsed when user manually interacts
      setAutoCollapsedProcesses((prev) => {
        const next = new Set(prev);
        next.delete(processId);
        return next;
      });

      // If user was at bottom, scroll to new bottom after state update
      if (wasAtBottom) {
        setTimeout(() => {
          virtuosoRef.current?.scrollToIndex({
            index: 'LAST',
            align: 'end',
            behavior: 'auto',
          });
        }, 0);
      }
    },
    [isAtBottom]
  );

  // Reset state when attempt changes
  useEffect(() => {
    if (currentAttemptIdRef.current !== selectedAttempt?.id) {
      setUserCollapsedProcesses(new Set());
      setAutoCollapsedProcesses(new Set());
      prevStatusRef.current.clear();
      autoCollapsedOnceRef.current.clear();
      prevLatestAgentIdRef.current = null;
      seenRunningRef.current.clear();
      initialAgentsCollapsedRef.current = false;
      currentAttemptIdRef.current = selectedAttempt?.id || null;
    }
  }, [selectedAttempt?.id]);

  // Auto-collapse setup/cleanup scripts when they complete OR on initial load
  // Also handle coding agent auto-collapse logic
  useEffect(() => {
    // One-shot initial collapse of non-latest coding agents
    if (!initialAgentsCollapsedRef.current) {
      const latestCodingAgentId = getLatestCodingAgent(filteredProcesses);
      if (latestCodingAgentId) {
        const toCollapse = filteredProcesses
          .filter(p => isCodingAgent(p.run_reason) && p.id !== latestCodingAgentId)
          .map(p => p.id)
          .filter(id => !userCollapsedProcesses.has(id));
        
        if (toCollapse.length > 0) {
          setAutoCollapsedProcesses(prev => new Set([...prev, ...toCollapse]));
          toCollapse.forEach(id => autoCollapsedOnceRef.current.add(id));
        }
        
        prevLatestAgentIdRef.current = latestCodingAgentId;
      }
      initialAgentsCollapsedRef.current = true;
    }

    filteredProcesses.forEach((process) => {
      // Handle setup/cleanup script auto-collapse
      if (isAutoCollapsibleProcess(process.run_reason)) {
        const prevStatus = prevStatusRef.current.get(process.id);
        const currentStatus = process.status;

        // Check if process should be auto-collapsed:
        // 1. Just completed (transition from running to completed/failed)
        // 2. Initial load of already completed process (prevStatus undefined)
        const shouldAutoCollapse =
          (prevStatus === PROCESS_STATUSES.RUNNING || // saw transition
            prevStatus === undefined) && // initial load
          isProcessCompleted(currentStatus) &&
          !autoCollapsedOnceRef.current.has(process.id) &&
          !userCollapsedProcesses.has(process.id);

        if (shouldAutoCollapse) {
          // Auto-collapse the process
          setAutoCollapsedProcesses((prev) => new Set([...prev, process.id]));
          autoCollapsedOnceRef.current.add(process.id);

          // Scroll to bottom if user was at bottom
          if (isAtBottom) {
            setTimeout(() => {
              virtuosoRef.current?.scrollToIndex({
                index: 'LAST',
                align: 'end',
                behavior: 'auto',
              });
            }, 0);
          }
        }

        // Auto-expand scripts that restart after completion
        const becameRunningAgain =
          prevStatus &&
          isProcessCompleted(prevStatus) &&
          currentStatus === PROCESS_STATUSES.RUNNING;

        if (becameRunningAgain) {
          setAutoCollapsedProcesses((prev) => {
            const next = new Set(prev);
            next.delete(process.id);
            return next;
          });
          autoCollapsedOnceRef.current.delete(process.id);
        }

        // Update previous status
        prevStatusRef.current.set(process.id, currentStatus);
      }

      // Handle coding agent follow-up detection and auto-collapse
      if (isCodingAgent(process.run_reason) && process.status === PROCESS_STATUSES.RUNNING) {
        if (!seenRunningRef.current.has(process.id)) {
          // New coding agent started running - collapse the previous latest
          const prevLatest = prevLatestAgentIdRef.current;
          if (prevLatest && 
              prevLatest !== process.id &&
              !userCollapsedProcesses.has(prevLatest) &&
              !autoCollapsedProcesses.has(prevLatest)) {
            setAutoCollapsedProcesses(prev => new Set([...prev, prevLatest]));
            autoCollapsedOnceRef.current.add(prevLatest);
            
            // Scroll to bottom if user was at bottom
            if (isAtBottom) {
              setTimeout(() => {
                virtuosoRef.current?.scrollToIndex({
                  index: 'LAST',
                  align: 'end',
                  behavior: 'auto',
                });
              }, 0);
            }
          }
          
          prevLatestAgentIdRef.current = process.id;
          seenRunningRef.current.add(process.id);
        }
      }
    });
  }, [filteredProcesses, userCollapsedProcesses, autoCollapsedProcesses, isAtBottom]);

  // Filter entries to hide logs from collapsed processes
  const visibleEntries = useMemo(() => {
    return entries.filter((entry) =>
      entry.channel === 'process_start'
        ? true
        : !allCollapsedProcesses.has(entry.processId)
    );
  }, [entries, allCollapsedProcesses]);

  // Memoized item content to prevent flickering
  const itemContent = useCallback(
    (index: number, entry: any) => (
      <LogEntryRow
        entry={entry}
        index={index}
        isCollapsed={
          entry.channel === 'process_start'
            ? allCollapsedProcesses.has(entry.payload.processId)
            : undefined
        }
        onToggleCollapse={
          entry.channel === 'process_start' ? toggleProcessCollapse : undefined
        }
      />
    ),
    [allCollapsedProcesses, toggleProcessCollapse]
  );

  // Handle when user manually scrolls away from bottom
  const handleAtBottomStateChange = useCallback((atBottom: boolean) => {
    setIsAtBottom(atBottom);
  }, []);

  if (!filteredProcesses || filteredProcesses.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <Cog className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No execution processes found for this attempt.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      <Virtuoso
        ref={virtuosoRef}
        style={{ height: '100%' }}
        data={visibleEntries}
        itemContent={itemContent}
        followOutput={isAtBottom ? 'smooth' : false}
        atBottomStateChange={handleAtBottomStateChange}
        increaseViewportBy={200}
        overscan={5}
        components={{
          Footer: () => <div style={{ height: '50px' }} />,
        }}
      />
    </div>
  );
}

export default LogsTab;
