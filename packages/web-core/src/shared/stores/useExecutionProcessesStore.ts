import { create } from 'zustand';
import type { ExecutionProcess } from 'shared/types';

// ---------------------------------------------------------------------------
// Zustand store for execution processes data (SSE/WebSocket stream).
// Populated by ExecutionProcessesProvider via setExecutionProcessesData();
// consumers subscribe to individual slices with the exported atomic selectors.
// ---------------------------------------------------------------------------

const EMPTY_PROCESSES: ExecutionProcess[] = [];
const EMPTY_BY_ID: Record<string, ExecutionProcess> = {};

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

interface ExecutionProcessesData {
  executionProcessesAll: ExecutionProcess[];
  executionProcessesByIdAll: Record<string, ExecutionProcess>;
  isAttemptRunningAll: boolean;

  executionProcessesVisible: ExecutionProcess[];
  executionProcessesByIdVisible: Record<string, ExecutionProcess>;
  isAttemptRunningVisible: boolean;

  isLoading: boolean;
  isConnected: boolean;
  error: string | null;
}

interface ExecutionProcessesState extends ExecutionProcessesData {
  /** Batch-update all execution processes data fields. Called by ExecutionProcessesProvider. */
  setExecutionProcessesData: (data: ExecutionProcessesData) => void;
  /** Reset to defaults. Called on unmount. */
  clearExecutionProcessesData: () => void;
}

const DEFAULT_DATA: ExecutionProcessesData = {
  executionProcessesAll: EMPTY_PROCESSES,
  executionProcessesByIdAll: EMPTY_BY_ID,
  isAttemptRunningAll: false,

  executionProcessesVisible: EMPTY_PROCESSES,
  executionProcessesByIdVisible: EMPTY_BY_ID,
  isAttemptRunningVisible: false,

  isLoading: true,
  isConnected: false,
  error: null,
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useExecutionProcessesStore = create<ExecutionProcessesState>()(
  (set) => ({
    ...DEFAULT_DATA,

    setExecutionProcessesData: (data) => set(data),

    clearExecutionProcessesData: () => set(DEFAULT_DATA),
  })
);

// ---------------------------------------------------------------------------
// Atomic selectors — each subscribes to a single field to minimise rerenders
// ---------------------------------------------------------------------------

export const useExecutionProcessesAll = () =>
  useExecutionProcessesStore((s) => s.executionProcessesAll);

export const useExecutionProcessesVisible = () =>
  useExecutionProcessesStore((s) => s.executionProcessesVisible);

export const useIsAttemptRunningVisible = () =>
  useExecutionProcessesStore((s) => s.isAttemptRunningVisible);

export const useExecutionProcessesIsLoading = () =>
  useExecutionProcessesStore((s) => s.isLoading);

export const useExecutionProcessesIsConnected = () =>
  useExecutionProcessesStore((s) => s.isConnected);

export const useExecutionProcessesError = () =>
  useExecutionProcessesStore((s) => s.error);
