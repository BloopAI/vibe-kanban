import {
  ExecutionProcess,
  ExecutionProcessStatus,
  PatchType,
} from 'shared/types';
import { useExecutionProcessesContext } from '@/shared/hooks/useExecutionProcessesContext';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { streamJsonPatchEntries } from '@/shared/lib/streamJsonPatchEntries';
import type {
  AddEntryType,
  ConversationTimelineSource,
  ExecutionProcessStateStore,
  PatchTypeWithKey,
  UseConversationHistoryParams,
} from '@/shared/hooks/useConversationHistory/types';

// Result type for the new UI's conversation history hook
export interface UseConversationHistoryResult {
  /** Whether the conversation only has a single coding agent turn (no follow-ups) */
  isFirstTurn: boolean;
  /** Whether background batches are still loading older history entries */
  isLoadingHistory: boolean;
  /** Whether more older history can be loaded on demand. */
  hasMoreHistory: boolean;
  /** Load another batch of older history entries. */
  loadMoreHistory: () => Promise<void>;
}
import {
  MIN_INITIAL_ENTRIES,
  REMAINING_BATCH_SIZE,
} from '@/shared/hooks/useConversationHistory/constants';

export const useConversationHistory = ({
  onTimelineUpdated,
  scopeKey,
}: UseConversationHistoryParams): UseConversationHistoryResult => {
  const {
    executionProcessesVisible: executionProcessesRaw,
    isLoading,
    isConnected,
  } = useExecutionProcessesContext();
  const executionProcesses = useRef<ExecutionProcess[]>(executionProcessesRaw);
  const displayedExecutionProcesses = useRef<ExecutionProcessStateStore>({});
  const loadedInitialEntries = useRef(false);
  const emittedEmptyInitialRef = useRef(false);
  const streamingProcessIdsRef = useRef<Set<string>>(new Set());
  const knownProcessIdsRef = useRef<Set<string>>(new Set());
  const onTimelineUpdatedRef = useRef<
    UseConversationHistoryParams['onTimelineUpdated'] | null
  >(null);
  const previousStatusMapRef = useRef<Map<string, ExecutionProcessStatus>>(
    new Map()
  );
  const [isLoadingHistoryState, setIsLoadingHistory] = useState(false);
  const [hasMoreHistoryState, setHasMoreHistory] = useState(false);
  const historyEntryLimitRef = useRef(MIN_INITIAL_ENTRIES);

  // Derive whether this is the first turn (no follow-up processes exist)
  const isFirstTurn = useMemo(() => {
    const codingAgentProcessCount = executionProcessesRaw.filter(
      (ep) =>
        ep.executor_action.typ.type === 'CodingAgentInitialRequest' ||
        ep.executor_action.typ.type === 'CodingAgentFollowUpRequest'
    ).length;
    return codingAgentProcessCount <= 1;
  }, [executionProcessesRaw]);

  const mergeIntoDisplayed = (
    mutator: (state: ExecutionProcessStateStore) => void
  ) => {
    const state = displayedExecutionProcesses.current;
    mutator(state);
  };

  // The hook owns transport, loading, and reconciliation.
  // It emits a source model that later derivation layers can transform further.

  const buildTimelineSource = useCallback(
    (
      executionProcessState: ExecutionProcessStateStore
    ): ConversationTimelineSource => ({
      executionProcessState,
      liveExecutionProcesses: executionProcesses.current,
    }),
    []
  );

  useEffect(() => {
    onTimelineUpdatedRef.current = onTimelineUpdated;
  }, [onTimelineUpdated]);

  // Keep executionProcesses up to date
  useEffect(() => {
    executionProcesses.current = executionProcessesRaw.filter(
      (ep) =>
        ep.run_reason === 'setupscript' ||
        ep.run_reason === 'cleanupscript' ||
        ep.run_reason === 'archivescript' ||
        ep.run_reason === 'codingagent'
    );
  }, [executionProcessesRaw]);

  const loadEntriesForHistoricExecutionProcess = useCallback(
    (
      executionProcess: ExecutionProcess,
      opts?: {
        onEntries?: (entries: PatchType[]) => void;
      }
    ) => {
      let url = '';
      if (executionProcess.executor_action.typ.type === 'ScriptRequest') {
        url = `/api/execution-processes/${executionProcess.id}/raw-logs/ws`;
      } else {
        url = `/api/execution-processes/${executionProcess.id}/normalized-logs/ws`;
      }

      return new Promise<PatchType[]>((resolve) => {
        const controller = streamJsonPatchEntries<PatchType>(url, {
          onEntries: (entries) => {
            opts?.onEntries?.(entries);
          },
          onFinished: (allEntries) => {
            controller.close();
            resolve(allEntries);
          },
          onError: (err) => {
            console.warn(
              `Error loading entries for historic execution process ${executionProcess.id}`,
              err
            );
            controller.close();
            resolve([]);
          },
        });
      });
    },
    []
  );

  const patchWithKey = (
    patch: PatchType,
    executionProcessId: string,
    index: number
  ) => {
    return {
      ...patch,
      patchKey: `${executionProcessId}:${index}`,
      executionProcessId,
    };
  };

  const flattenEntries = (
    executionProcessState: ExecutionProcessStateStore
  ): PatchTypeWithKey[] => {
    return Object.values(executionProcessState)
      .filter(
        (p) =>
          p.executionProcess.executor_action.typ.type ===
            'CodingAgentFollowUpRequest' ||
          p.executionProcess.executor_action.typ.type ===
            'CodingAgentInitialRequest' ||
          p.executionProcess.executor_action.typ.type === 'ReviewRequest'
      )
      .sort(
        (a, b) =>
          new Date(
            a.executionProcess.created_at as unknown as string
          ).getTime() -
          new Date(b.executionProcess.created_at as unknown as string).getTime()
      )
      .flatMap((p) => p.entries);
  };

  const getActiveAgentProcesses = (): ExecutionProcess[] => {
    return (
      executionProcesses?.current.filter(
        (p) =>
          p.status === ExecutionProcessStatus.running &&
          p.run_reason !== 'devserver'
      ) ?? []
    );
  };

  const emitEntries = useCallback(
    (
      executionProcessState: ExecutionProcessStateStore,
      addEntryType: AddEntryType,
      loading: boolean
    ) => {
      const timelineSource = buildTimelineSource(executionProcessState);
      let modifiedAddEntryType = addEntryType;

      const latestEntry = Object.values(executionProcessState)
        .sort(
          (a, b) =>
            new Date(
              a.executionProcess.created_at as unknown as string
            ).getTime() -
            new Date(
              b.executionProcess.created_at as unknown as string
            ).getTime()
        )
        .flatMap((processState) => processState.entries)
        .at(-1);

      if (
        latestEntry?.type === 'NORMALIZED_ENTRY' &&
        latestEntry.content.entry_type.type === 'tool_use' &&
        latestEntry.content.entry_type.tool_name === 'ExitPlanMode'
      ) {
        modifiedAddEntryType = 'plan';
      }

      onTimelineUpdatedRef.current?.(
        timelineSource,
        modifiedAddEntryType,
        loading
      );
    },
    [buildTimelineSource]
  );

  // This emits its own events as they are streamed
  const loadRunningAndEmit = useCallback(
    (executionProcess: ExecutionProcess): Promise<void> => {
      return new Promise((resolve, reject) => {
        let url = '';
        if (executionProcess.executor_action.typ.type === 'ScriptRequest') {
          url = `/api/execution-processes/${executionProcess.id}/raw-logs/ws`;
        } else {
          url = `/api/execution-processes/${executionProcess.id}/normalized-logs/ws`;
        }
        const controller = streamJsonPatchEntries<PatchType>(url, {
          onEntries(entries) {
            const patchesWithKey = entries.map((entry, index) =>
              patchWithKey(entry, executionProcess.id, index)
            );
            mergeIntoDisplayed((state) => {
              state[executionProcess.id] = {
                executionProcess,
                entries: patchesWithKey,
              };
            });
            emitEntries(displayedExecutionProcesses.current, 'running', false);
          },
          onFinished: () => {
            emitEntries(displayedExecutionProcesses.current, 'running', false);
            controller.close();
            resolve();
          },
          onError: () => {
            controller.close();
            reject();
          },
        });
      });
    },
    [emitEntries]
  );

  // Sometimes it can take a few seconds for the stream to start, wrap the loadRunningAndEmit method
  const loadRunningAndEmitWithBackoff = useCallback(
    async (executionProcess: ExecutionProcess) => {
      for (let i = 0; i < 20; i++) {
        try {
          await loadRunningAndEmit(executionProcess);
          break;
        } catch (_) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
    },
    [loadRunningAndEmit]
  );

  const loadHistoricEntries = useCallback(
    async (
      maxEntries?: number,
      addEntryType: AddEntryType = 'historic'
    ): Promise<{
      state: ExecutionProcessStateStore;
      truncated: boolean;
    }> => {
      const localDisplayedExecutionProcesses: ExecutionProcessStateStore = {};
      let truncated = false;

      if (!executionProcesses?.current) {
        return { state: localDisplayedExecutionProcesses, truncated };
      }

      for (const executionProcess of [
        ...executionProcesses.current,
      ].reverse()) {
        if (executionProcess.status === ExecutionProcessStatus.running)
          continue;

        let latestEntries: PatchTypeWithKey[] = [];
        const entries = await loadEntriesForHistoricExecutionProcess(
          executionProcess,
          {
            onEntries: (partialEntries) => {
              latestEntries = partialEntries.map((entry, index) =>
                patchWithKey(entry, executionProcess.id, index)
              );
              localDisplayedExecutionProcesses[executionProcess.id] = {
                executionProcess,
                entries: latestEntries,
              };
              mergeIntoDisplayed((state) => {
                state[executionProcess.id] = {
                  executionProcess,
                  entries: latestEntries,
                };
              });
              emitEntries(
                displayedExecutionProcesses.current,
                addEntryType,
                true
              );
            },
          }
        );
        const entriesWithKey =
          latestEntries.length > 0
            ? latestEntries
            : entries.map((e, idx) =>
                patchWithKey(e, executionProcess.id, idx)
              );

        localDisplayedExecutionProcesses[executionProcess.id] = {
          executionProcess,
          entries: entriesWithKey,
        };

        if (
          maxEntries != null &&
          flattenEntries(localDisplayedExecutionProcesses).length > maxEntries
        ) {
          truncated = true;
          break;
        }
      }

      return { state: localDisplayedExecutionProcesses, truncated };
    },
    [executionProcesses]
  );

  const ensureProcessVisible = useCallback((p: ExecutionProcess) => {
    mergeIntoDisplayed((state) => {
      if (!state[p.id]) {
        state[p.id] = {
          executionProcess: {
            id: p.id,
            created_at: p.created_at,
            updated_at: p.updated_at,
            executor_action: p.executor_action,
          },
          entries: [],
        };
      }
    });
  }, []);

  const idListKey = useMemo(
    () => executionProcessesRaw?.map((p) => p.id).join(','),
    [executionProcessesRaw]
  );

  const idStatusKey = useMemo(
    () => executionProcessesRaw?.map((p) => `${p.id}:${p.status}`).join(','),
    [executionProcessesRaw]
  );

  // Clean up entries for processes that have been removed (e.g., after reset)
  useEffect(() => {
    if (isLoading || !isConnected) return;
    const visibleProcessIds = new Set(executionProcessesRaw.map((p) => p.id));
    const displayedIds = Object.keys(displayedExecutionProcesses.current);
    let changed = false;

    for (const id of displayedIds) {
      if (!visibleProcessIds.has(id)) {
        delete displayedExecutionProcesses.current[id];
        changed = true;
      }
    }

    if (changed) {
      emitEntries(displayedExecutionProcesses.current, 'historic', false);
    }
  }, [idListKey, executionProcessesRaw, emitEntries, isLoading, isConnected]);

  useEffect(() => {
    displayedExecutionProcesses.current = {};
    loadedInitialEntries.current = false;
    emittedEmptyInitialRef.current = false;
    streamingProcessIdsRef.current.clear();
    knownProcessIdsRef.current.clear();
    previousStatusMapRef.current.clear();
    historyEntryLimitRef.current = MIN_INITIAL_ENTRIES;
    setHasMoreHistory(false);
    setIsLoadingHistory(false);
    emitEntries(displayedExecutionProcesses.current, 'initial', true);
  }, [scopeKey, emitEntries]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (loadedInitialEntries.current) return;

      if (isLoading) return;

      if (executionProcesses.current.length === 0) {
        if (emittedEmptyInitialRef.current) return;
        emittedEmptyInitialRef.current = true;
        emitEntries(displayedExecutionProcesses.current, 'initial', false);
        return;
      }

      emittedEmptyInitialRef.current = false;

      const { state: allInitialEntries, truncated } = await loadHistoricEntries(
        MIN_INITIAL_ENTRIES,
        'initial'
      );
      if (cancelled) return;
      loadedInitialEntries.current = true;
      knownProcessIdsRef.current = new Set(
        executionProcessesRaw.map((process) => process.id)
      );
      historyEntryLimitRef.current = MIN_INITIAL_ENTRIES;
      setHasMoreHistory(truncated);
      mergeIntoDisplayed((state) => {
        Object.assign(state, allInitialEntries);
      });
      emitEntries(displayedExecutionProcesses.current, 'initial', false);
      if (!cancelled) {
        setIsLoadingHistory(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    scopeKey,
    idListKey,
    isLoading,
    loadHistoricEntries,
    emitEntries,
    executionProcessesRaw,
  ]);

  useEffect(() => {
    if (!loadedInitialEntries.current || isLoading) return;

    const currentProcessIds = new Set(
      executionProcessesRaw.map((process) => process.id)
    );
    const newCompletedProcesses = executionProcessesRaw.filter(
      (process) =>
        !knownProcessIdsRef.current.has(process.id) &&
        process.status !== ExecutionProcessStatus.running
    );

    knownProcessIdsRef.current = currentProcessIds;

    if (newCompletedProcesses.length === 0) return;

    let cancelled = false;

    void (async () => {
      let updated = false;

      for (const process of newCompletedProcesses) {
        let latestEntries: PatchTypeWithKey[] = [];
        const entries = await loadEntriesForHistoricExecutionProcess(process, {
          onEntries: (partialEntries) => {
            latestEntries = partialEntries.map((entry, index) =>
              patchWithKey(entry, process.id, index)
            );

            mergeIntoDisplayed((state) => {
              state[process.id] = {
                executionProcess: process,
                entries: latestEntries,
              };
            });
            emitEntries(displayedExecutionProcesses.current, 'historic', false);
          },
        });
        if (cancelled) return;

        const entriesWithKey =
          latestEntries.length > 0
            ? latestEntries
            : entries.map((entry, index) =>
                patchWithKey(entry, process.id, index)
              );

        mergeIntoDisplayed((state) => {
          state[process.id] = {
            executionProcess: process,
            entries: entriesWithKey,
          };
        });
        updated = true;
      }

      if (updated) {
        emitEntries(displayedExecutionProcesses.current, 'historic', false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    executionProcessesRaw,
    idListKey,
    isLoading,
    loadEntriesForHistoricExecutionProcess,
    emitEntries,
  ]);

  useEffect(() => {
    const activeProcesses = getActiveAgentProcesses();
    if (activeProcesses.length === 0) return;

    for (const activeProcess of activeProcesses) {
      if (!displayedExecutionProcesses.current[activeProcess.id]) {
        const runningOrInitial =
          Object.keys(displayedExecutionProcesses.current).length > 1
            ? 'running'
            : 'initial';
        ensureProcessVisible(activeProcess);
        emitEntries(
          displayedExecutionProcesses.current,
          runningOrInitial,
          false
        );
      }

      if (
        activeProcess.status === ExecutionProcessStatus.running &&
        !streamingProcessIdsRef.current.has(activeProcess.id)
      ) {
        streamingProcessIdsRef.current.add(activeProcess.id);
        loadRunningAndEmitWithBackoff(activeProcess).finally(() => {
          streamingProcessIdsRef.current.delete(activeProcess.id);
        });
      }
    }
  }, [
    scopeKey,
    idStatusKey,
    emitEntries,
    ensureProcessVisible,
    loadRunningAndEmitWithBackoff,
  ]);

  useEffect(() => {
    if (!executionProcessesRaw) return;

    const processesToReload: ExecutionProcess[] = [];

    for (const process of executionProcessesRaw) {
      const previousStatus = previousStatusMapRef.current.get(process.id);
      const currentStatus = process.status;

      if (
        previousStatus === ExecutionProcessStatus.running &&
        currentStatus !== ExecutionProcessStatus.running &&
        displayedExecutionProcesses.current[process.id]
      ) {
        processesToReload.push(process);
      }

      previousStatusMapRef.current.set(process.id, currentStatus);
    }

    if (processesToReload.length === 0) return;

    (async () => {
      let anyUpdated = false;

      for (const process of processesToReload) {
        let latestEntries: PatchTypeWithKey[] = [];
        const entries = await loadEntriesForHistoricExecutionProcess(process, {
          onEntries: (partialEntries) => {
            latestEntries = partialEntries.map((entry, index) =>
              patchWithKey(entry, process.id, index)
            );

            mergeIntoDisplayed((state) => {
              state[process.id] = {
                executionProcess: process,
                entries: latestEntries,
              };
            });
            emitEntries(displayedExecutionProcesses.current, 'running', false);
          },
        });
        const entriesWithKey =
          latestEntries.length > 0
            ? latestEntries
            : entries.map((e, idx) => patchWithKey(e, process.id, idx));

        mergeIntoDisplayed((state) => {
          state[process.id] = {
            executionProcess: process,
            entries: entriesWithKey,
          };
        });
        anyUpdated = true;
      }

      if (anyUpdated) {
        emitEntries(displayedExecutionProcesses.current, 'running', false);
      }
    })();
  }, [idStatusKey, executionProcessesRaw, emitEntries]);

  // If an execution process is removed, remove it from the state
  useEffect(() => {
    if (!executionProcessesRaw) return;

    const removedProcessIds = Object.keys(
      displayedExecutionProcesses.current
    ).filter((id) => !executionProcessesRaw.some((p) => p.id === id));

    if (removedProcessIds.length > 0) {
      mergeIntoDisplayed((state) => {
        removedProcessIds.forEach((id) => {
          delete state[id];
        });
      });
    }
  }, [scopeKey, idListKey, executionProcessesRaw]);

  const loadMoreHistory = useCallback(async () => {
    if (!loadedInitialEntries.current) return;
    if (isLoading || isLoadingHistoryState || !hasMoreHistoryState) return;

    setIsLoadingHistory(true);
    const nextLimit = historyEntryLimitRef.current + REMAINING_BATCH_SIZE;

    try {
      const { state: moreHistory, truncated } =
        await loadHistoricEntries(nextLimit);
      historyEntryLimitRef.current = nextLimit;
      setHasMoreHistory(truncated);
      mergeIntoDisplayed((state) => {
        Object.entries(moreHistory).forEach(([processId, processState]) => {
          state[processId] = processState;
        });
      });
      emitEntries(displayedExecutionProcesses.current, 'historic', false);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [
    emitEntries,
    hasMoreHistoryState,
    isLoading,
    isLoadingHistoryState,
    loadHistoricEntries,
  ]);

  return {
    isFirstTurn,
    isLoadingHistory: isLoadingHistoryState,
    hasMoreHistory: hasMoreHistoryState,
    loadMoreHistory,
  };
};
