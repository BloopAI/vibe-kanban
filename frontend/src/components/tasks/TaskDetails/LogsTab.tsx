import {
  useContext,
  useRef,
  useCallback,
  useMemo,
  useEffect,
  useReducer,
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

// Helper functions
function addAll<T>(set: Set<T>, items: T[]): Set<T> {
  items.forEach((i: T) => set.add(i));
  return set;
}

// State management types
type LogsState = {
  userCollapsed: Set<string>;
  autoCollapsed: Set<string>;
  prevStatus: Map<string, ExecutionProcessStatus>;
  prevLatestAgent?: string;
};

type LogsAction =
  | { type: 'RESET_ATTEMPT' }
  | { type: 'TOGGLE_USER'; id: string }
  | { type: 'AUTO_COLLAPSE'; ids: string[] }
  | { type: 'AUTO_EXPAND'; ids: string[] }
  | { type: 'UPDATE_STATUS'; id: string; status: ExecutionProcessStatus }
  | { type: 'NEW_RUNNING_AGENT'; id: string };

const initialState: LogsState = {
  userCollapsed: new Set(),
  autoCollapsed: new Set(),
  prevStatus: new Map(),
  prevLatestAgent: undefined,
};

function reducer(state: LogsState, action: LogsAction): LogsState {
  switch (action.type) {
    case 'RESET_ATTEMPT':
      return { ...initialState };

    case 'TOGGLE_USER': {
      const newUserCollapsed = new Set(state.userCollapsed);
      const newAutoCollapsed = new Set(state.autoCollapsed);

      const isCurrentlyCollapsed =
        newUserCollapsed.has(action.id) || newAutoCollapsed.has(action.id);

      if (isCurrentlyCollapsed) {
        // we want to EXPAND
        newUserCollapsed.delete(action.id);
        newAutoCollapsed.delete(action.id);
      } else {
        // we want to COLLAPSE
        newUserCollapsed.add(action.id);
      }

      return {
        ...state,
        userCollapsed: newUserCollapsed,
        autoCollapsed: newAutoCollapsed,
      };
    }

    case 'AUTO_COLLAPSE': {
      const newAutoCollapsed = new Set(state.autoCollapsed);
      addAll(newAutoCollapsed, action.ids);
      return {
        ...state,
        autoCollapsed: newAutoCollapsed,
      };
    }

    case 'AUTO_EXPAND': {
      const newAutoCollapsed = new Set(state.autoCollapsed);
      action.ids.forEach((id) => newAutoCollapsed.delete(id));
      return {
        ...state,
        autoCollapsed: newAutoCollapsed,
      };
    }

    case 'UPDATE_STATUS': {
      const newPrevStatus = new Map(state.prevStatus);
      newPrevStatus.set(action.id, action.status);
      return {
        ...state,
        prevStatus: newPrevStatus,
      };
    }

    case 'NEW_RUNNING_AGENT':
      return {
        ...state,
        prevLatestAgent: action.id,
      };

    default:
      return state;
  }
}

function LogsTab() {
  const { attemptData } = useContext(TaskAttemptDataContext);
  const { selectedAttempt } = useContext(TaskSelectedAttemptContext);
  const virtuosoRef = useRef<any>(null);

  const [state, dispatch] = useReducer(reducer, initialState);

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
    const combined = new Set(state.autoCollapsed);
    state.userCollapsed.forEach((id: string) => combined.add(id));
    return combined;
  }, [state.autoCollapsed, state.userCollapsed]);

  // Toggle collapsed state for a process (user action)
  const toggleProcessCollapse = useCallback((processId: string) => {
    dispatch({ type: 'TOGGLE_USER', id: processId });
  }, []);

  // Effect #1: Reset state when attempt changes
  useEffect(() => {
    dispatch({ type: 'RESET_ATTEMPT' });
  }, [selectedAttempt?.id]);

  // Effect #2: Handle setup/cleanup script auto-collapse and auto-expand
  useEffect(() => {
    const toCollapse: string[] = [];
    const toExpand: string[] = [];

    filteredProcesses.forEach((process) => {
      if (isAutoCollapsibleProcess(process.run_reason)) {
        const prevStatus = state.prevStatus.get(process.id);
        const currentStatus = process.status;

        // Auto-collapse completed setup/cleanup scripts
        const shouldAutoCollapse =
          (prevStatus === PROCESS_STATUSES.RUNNING ||
            prevStatus === undefined) &&
          isProcessCompleted(currentStatus) &&
          !state.userCollapsed.has(process.id) &&
          !state.autoCollapsed.has(process.id);

        if (shouldAutoCollapse) {
          toCollapse.push(process.id);
        }

        // Auto-expand scripts that restart after completion
        const becameRunningAgain =
          prevStatus &&
          isProcessCompleted(prevStatus) &&
          currentStatus === PROCESS_STATUSES.RUNNING &&
          state.autoCollapsed.has(process.id);

        if (becameRunningAgain) {
          toExpand.push(process.id);
        }

        // Update status tracking
        dispatch({
          type: 'UPDATE_STATUS',
          id: process.id,
          status: currentStatus,
        });
      }
    });

    if (toCollapse.length > 0) {
      dispatch({ type: 'AUTO_COLLAPSE', ids: toCollapse });
    }

    if (toExpand.length > 0) {
      dispatch({ type: 'AUTO_EXPAND', ids: toExpand });
    }
  }, [filteredProcesses, state.userCollapsed, state.autoCollapsed]);

  // Effect #3: Handle coding agent succession logic
  useEffect(() => {
    const latestCodingAgentId = getLatestCodingAgent(filteredProcesses);
    if (!latestCodingAgentId) return;

    // Collapse previous agents when a new latest agent appears
    if (latestCodingAgentId !== state.prevLatestAgent) {
      // Collapse all other coding agents that aren't user-collapsed
      const toCollapse = filteredProcesses
        .filter(
          (p) =>
            isCodingAgent(p.run_reason) &&
            p.id !== latestCodingAgentId &&
            !state.userCollapsed.has(p.id) &&
            !state.autoCollapsed.has(p.id)
        )
        .map((p) => p.id);

      if (toCollapse.length > 0) {
        dispatch({ type: 'AUTO_COLLAPSE', ids: toCollapse });
      }

      dispatch({ type: 'NEW_RUNNING_AGENT', id: latestCodingAgentId });
    }
  }, [
    filteredProcesses,
    state.prevLatestAgent,
    state.userCollapsed,
    state.autoCollapsed,
  ]);

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
        followOutput={true}
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
