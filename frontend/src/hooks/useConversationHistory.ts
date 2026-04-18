// useConversationHistory.ts
import {
  BaseCodingAgent,
  CodingAgentReviewTarget,
  CommandExitStatus,
  ExecutionProcess,
  ExecutionProcessStatus,
  ExecutorAction,
  NormalizedEntry,
  PatchType,
  TaskAttempt,
  ToolStatus,
} from 'shared/types';
import { useExecutionProcessesContext } from '@/contexts/ExecutionProcessesContext';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { streamJsonPatchEntries } from '@/utils/streamJsonPatchEntries';
import { useEffectivePagination } from './useEffectivePagination';
import { logsApi } from '@/lib/api';
import { logEntriesToPatches } from '@/utils/logEntryToPatch';

export type PatchTypeWithKey = PatchType & {
  patchKey: string;
  executionProcessId: string;
};

export type AddEntryType = 'initial' | 'running' | 'historic';

export type OnEntriesUpdated = (
  newEntries: PatchTypeWithKey[],
  addType: AddEntryType,
  loading: boolean
) => void;

type ExecutionProcessStaticInfo = {
  id: string;
  created_at: string;
  updated_at: string;
  executor_action: ExecutorAction;
};

type ExecutionProcessState = {
  executionProcess: ExecutionProcessStaticInfo;
  entries: PatchTypeWithKey[];
};

type ExecutionProcessStateStore = Record<string, ExecutionProcessState>;

interface UseConversationHistoryParams {
  attempt: TaskAttempt;
  onEntriesUpdated: OnEntriesUpdated;
}

interface UseConversationHistoryResult {}

// Cap for minimum initial entries (ensure we always show at least some entries quickly)
const MIN_INITIAL_ENTRIES_CAP = 10;

const loadingPatch: PatchTypeWithKey = {
  type: 'NORMALIZED_ENTRY',
  content: {
    entry_type: {
      type: 'loading',
    },
    content: '',
    timestamp: null,
    metadata: null,
  },
  patchKey: 'loading',
  executionProcessId: '',
};

const nextActionPatch: (
  failed: boolean,
  execution_processes: number,
  needs_setup: boolean
) => PatchTypeWithKey = (failed, execution_processes, needs_setup) => ({
  type: 'NORMALIZED_ENTRY',
  content: {
    entry_type: {
      type: 'next_action',
      failed: failed,
      execution_processes: execution_processes,
      needs_setup: needs_setup,
    },
    content: '',
    timestamp: null,
    metadata: null,
  },
  patchKey: 'next_action',
  executionProcessId: '',
});

const executionStartPatch = (
  processId: string,
  processName: string,
  startedAt: string
): PatchTypeWithKey => ({
  type: 'NORMALIZED_ENTRY',
  content: {
    entry_type: {
      type: 'execution_start',
      process_id: processId,
      process_name: processName,
      started_at: startedAt,
    },
    content: '',
    timestamp: startedAt,
    metadata: null,
  },
  patchKey: `${processId}:execution_start`,
  executionProcessId: processId,
});

const executionEndPatch = (
  processId: string,
  processName: string,
  startedAt: string,
  endedAt: string,
  status: string
): PatchTypeWithKey => {
  const startTime = new Date(startedAt).getTime();
  const endTime = new Date(endedAt).getTime();
  const durationSeconds = Math.max(0, Math.floor((endTime - startTime) / 1000));

  return {
    type: 'NORMALIZED_ENTRY',
    content: {
      entry_type: {
        type: 'execution_end',
        process_id: processId,
        process_name: processName,
        started_at: startedAt,
        ended_at: endedAt,
        duration_seconds: BigInt(durationSeconds),
        status: status,
      },
      content: '',
      timestamp: endedAt,
      metadata: null,
    },
    patchKey: `${processId}:execution_end`,
    executionProcessId: processId,
  };
};

export const useConversationHistory = ({
  attempt,
  onEntriesUpdated,
}: UseConversationHistoryParams): UseConversationHistoryResult => {
  const {
    executionProcessesVisible: executionProcessesRaw,
    isLoading: isExecutionProcessesLoading,
  } = useExecutionProcessesContext();

  // Get effective pagination settings (respects per-conversation overrides)
  const { effectiveLimit } = useEffectivePagination(attempt.id);

  // Calculate pagination parameters from effective limit
  // minInitialEntries: Load at least this many entries initially (capped at 10)
  // batchSize: How many entries to load when scrolling up for more history
  const minInitialEntries = Math.min(MIN_INITIAL_ENTRIES_CAP, effectiveLimit);
  const batchSize = Math.max(10, Math.floor(effectiveLimit / 2));

  // Store pagination values in refs so they're available in callbacks without causing re-renders
  const paginationRef = useRef({ minInitialEntries, batchSize });
  paginationRef.current = { minInitialEntries, batchSize };

  const executionProcesses = useRef<ExecutionProcess[]>(executionProcessesRaw);
  const displayedExecutionProcesses = useRef<ExecutionProcessStateStore>({});
  const loadedInitialEntries = useRef(false);
  const lastActiveProcessId = useRef<string | null>(null);
  const onEntriesUpdatedRef = useRef<OnEntriesUpdated | null>(null);
  // Track active stream controllers to prevent duplicate connections and enable cleanup
  const activeStreamControllers = useRef<Map<string, { close: () => void }>>(
    new Map()
  );

  const mergeIntoDisplayed = (
    mutator: (state: ExecutionProcessStateStore) => void
  ) => {
    const state = displayedExecutionProcesses.current;
    mutator(state);
  };
  useEffect(() => {
    onEntriesUpdatedRef.current = onEntriesUpdated;
  }, [onEntriesUpdated]);

  // Keep executionProcesses up to date
  useEffect(() => {
    executionProcesses.current = executionProcessesRaw.filter(
      (ep) =>
        ep.run_reason === 'setupscript' ||
        ep.run_reason === 'cleanupscript' ||
        ep.run_reason === 'codingagent'
    );
  }, [executionProcessesRaw]);

  /**
   * Load entries for a historic execution process.
   * - For script requests: Use WebSocket streaming (stdout/stderr)
   * - For coding agent: Use REST pagination API with backward direction
   *   to get newest entries first, then reverse for chronological display.
   */
  const loadEntriesForHistoricExecutionProcess = useCallback(
    async (executionProcess: ExecutionProcess): Promise<PatchType[]> => {
      // For script requests, use WebSocket streaming (stdout/stderr content)
      if (executionProcess.executor_action.typ.type === 'ScriptRequest') {
        const url = `/api/execution-processes/${executionProcess.id}/raw-logs/ws`;
        return new Promise<PatchType[]>((resolve) => {
          const controller = streamJsonPatchEntries<PatchType>(url, {
            onFinished: (allEntries) => {
              controller.close();
              resolve(allEntries);
            },
            onError: (err) => {
              console.warn(
                `Error loading raw logs for ${executionProcess.id}`,
                err
              );
              controller.close();
              resolve([]);
            },
          });
        });
      }

      // For coding agent processes, use REST pagination API
      try {
        const result = await logsApi.getPaginated(executionProcess.id, {
          limit: effectiveLimit,
          direction: 'backward', // Get newest entries first
        });

        // Reverse entries to chronological order BEFORE applying patches
        // JSON patches must be applied oldest-first for correct reconstruction
        const chronologicalEntries = [...result.entries].reverse();

        // Convert LogEntry[] to PatchType[] using JSON patch reconstruction
        const patches = logEntriesToPatches(
          chronologicalEntries,
          executionProcess.id
        );

        // Strip patchKey and executionProcessId for internal use
        return patches.map((p) => ({
          type: p.type,
          content: p.content,
        })) as PatchType[];
      } catch (err) {
        console.warn(
          `Error loading entries for historic execution process ${executionProcess.id}`,
          err
        );
        return [];
      }
    },
    [effectiveLimit]
  );

  const getLiveExecutionProcess = (
    executionProcessId: string
  ): ExecutionProcess | undefined => {
    return executionProcesses?.current.find(
      (executionProcess) => executionProcess.id === executionProcessId
    );
  };

  const patchWithKey = (
    patch: PatchType,
    executionProcessId: string,
    index: number | 'user'
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
            'CodingAgentReviewRequest' ||
          p.executionProcess.executor_action.typ.type ===
            'CodingAgentInitialRequest'
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

  const getActiveAgentProcess = (): ExecutionProcess | null => {
    const activeProcesses = executionProcesses?.current.filter(
      (p) =>
        p.status === ExecutionProcessStatus.running &&
        p.run_reason !== 'devserver'
    );
    if (activeProcesses.length > 1) {
      console.error('More than one active execution process found');
    }
    return activeProcesses[0] || null;
  };

  const flattenEntriesForEmit = useCallback(
    (executionProcessState: ExecutionProcessStateStore): PatchTypeWithKey[] => {
      // Flags to control Next Action bar emit
      let hasPendingApproval = false;
      let hasRunningProcess = false;
      let lastProcessFailedOrKilled = false;
      let needsSetup = false;

      // Helper to get process name from executor action
      const getProcessName = (executorAction: ExecutorAction): string => {
        const typ = executorAction.typ;
        if (
          typ.type === 'CodingAgentInitialRequest' ||
          typ.type === 'CodingAgentFollowUpRequest'
        ) {
          return 'Coding Agent';
        }
        if (typ.type === 'CodingAgentReviewRequest') {
          return 'Codex Review';
        }
        if (typ.type === 'ScriptRequest') {
          switch (typ.context) {
            case 'SetupScript':
              return 'Setup Script';
            case 'CleanupScript':
              return 'Cleanup Script';
            case 'ToolInstallScript':
              return 'Tool Install Script';
            default:
              return 'Script';
          }
        }
        return 'Execution';
      };

      // Create user messages + tool calls for setup/cleanup scripts
      const allEntries = Object.values(executionProcessState)
        .sort(
          (a, b) =>
            new Date(
              a.executionProcess.created_at as unknown as string
            ).getTime() -
            new Date(
              b.executionProcess.created_at as unknown as string
            ).getTime()
        )
        .flatMap((p, index) => {
          const entries: PatchTypeWithKey[] = [];
          const liveProcess = getLiveExecutionProcess(p.executionProcess.id);
          const processName = getProcessName(
            p.executionProcess.executor_action
          );

          // Skip timestamps for Setup/Cleanup scripts (run in parallel, duration inaccurate)
          const skipTimestamps =
            processName === 'Setup Script' || processName === 'Cleanup Script';

          // Add execution start marker
          if (!skipTimestamps && liveProcess?.started_at) {
            entries.push(
              executionStartPatch(
                p.executionProcess.id,
                processName,
                liveProcess.started_at
              )
            );
          }

          if (
            p.executionProcess.executor_action.typ.type ===
              'CodingAgentInitialRequest' ||
            p.executionProcess.executor_action.typ.type ===
              'CodingAgentReviewRequest' ||
            p.executionProcess.executor_action.typ.type ===
              'CodingAgentFollowUpRequest'
          ) {
            const prompt =
              p.executionProcess.executor_action.typ.type ===
              'CodingAgentReviewRequest'
                ? formatReviewPrompt(p.executionProcess.executor_action.typ.target)
                : p.executionProcess.executor_action.typ.prompt;
            // New user message
            const userNormalizedEntry: NormalizedEntry = {
              entry_type: {
                type: 'user_message',
              },
              content: prompt,
              timestamp: null,
              metadata: null,
            };
            const userPatch: PatchType = {
              type: 'NORMALIZED_ENTRY',
              content: userNormalizedEntry,
            };
            const userPatchTypeWithKey = patchWithKey(
              userPatch,
              p.executionProcess.id,
              'user'
            );
            entries.push(userPatchTypeWithKey);

            // Remove non-injected user messages from coding agent, replace with our custom one
            // Keep injected messages (they have metadata.injected === true)
            const entriesExcludingUser = p.entries.filter(
              (e) =>
                e.type !== 'NORMALIZED_ENTRY' ||
                e.content.entry_type.type !== 'user_message' ||
                e.content.metadata?.injected === true
            );

            const hasPendingApprovalEntry = entriesExcludingUser.some(
              (entry) => {
                if (entry.type !== 'NORMALIZED_ENTRY') return false;
                const entryType = entry.content.entry_type;
                return (
                  entryType.type === 'tool_use' &&
                  entryType.status.status === 'pending_approval'
                );
              }
            );

            if (hasPendingApprovalEntry) {
              hasPendingApproval = true;
            }

            entries.push(...entriesExcludingUser);

            const liveProcessStatus = liveProcess?.status;
            const isProcessRunning =
              liveProcessStatus === ExecutionProcessStatus.running;
            const processFailedOrKilled =
              liveProcessStatus === ExecutionProcessStatus.failed ||
              liveProcessStatus === ExecutionProcessStatus.killed;

            if (isProcessRunning) {
              hasRunningProcess = true;
            }

            if (
              processFailedOrKilled &&
              index === Object.keys(executionProcessState).length - 1
            ) {
              lastProcessFailedOrKilled = true;

              // Check if this failed process has a SetupRequired entry
              const hasSetupRequired = entriesExcludingUser.some((entry) => {
                if (entry.type !== 'NORMALIZED_ENTRY') return false;
                return (
                  entry.content.entry_type.type === 'error_message' &&
                  entry.content.entry_type.error_type.type === 'setup_required'
                );
              });

              if (hasSetupRequired) {
                needsSetup = true;
              }
            }

            if (isProcessRunning && !hasPendingApprovalEntry) {
              entries.push(loadingPatch);
            }

            // Add execution end marker for completed processes
            if (
              !isProcessRunning &&
              liveProcess?.started_at &&
              liveProcess?.completed_at
            ) {
              entries.push(
                executionEndPatch(
                  p.executionProcess.id,
                  processName,
                  liveProcess.started_at,
                  liveProcess.completed_at,
                  liveProcess.status
                )
              );
            }
          } else if (
            p.executionProcess.executor_action.typ.type === 'ScriptRequest'
          ) {
            // Add setup and cleanup script as a tool call
            let toolName = '';
            switch (p.executionProcess.executor_action.typ.context) {
              case 'SetupScript':
                toolName = 'Setup Script';
                break;
              case 'CleanupScript':
                toolName = 'Cleanup Script';
                break;
              case 'ToolInstallScript':
                toolName = 'Tool Install Script';
                break;
              default:
                return [];
            }

            const executionProcess = liveProcess;

            if (executionProcess?.status === ExecutionProcessStatus.running) {
              hasRunningProcess = true;
            }

            if (
              (executionProcess?.status === ExecutionProcessStatus.failed ||
                executionProcess?.status === ExecutionProcessStatus.killed) &&
              index === Object.keys(executionProcessState).length - 1
            ) {
              lastProcessFailedOrKilled = true;
            }

            const exitCode = Number(executionProcess?.exit_code) || 0;
            const exit_status: CommandExitStatus | null =
              executionProcess?.status === 'running'
                ? null
                : {
                    type: 'exit_code',
                    code: exitCode,
                  };

            const toolStatus: ToolStatus =
              executionProcess?.status === ExecutionProcessStatus.running
                ? { status: 'created' }
                : exitCode === 0
                  ? { status: 'success' }
                  : { status: 'failed' };

            const output = p.entries.map((line) => line.content).join('\n');

            const toolNormalizedEntry: NormalizedEntry = {
              entry_type: {
                type: 'tool_use',
                tool_name: toolName,
                action_type: {
                  action: 'command_run',
                  command: p.executionProcess.executor_action.typ.script,
                  result: {
                    output,
                    exit_status,
                  },
                },
                status: toolStatus,
              },
              content: toolName,
              timestamp: null,
              metadata: null,
            };
            const toolPatch: PatchType = {
              type: 'NORMALIZED_ENTRY',
              content: toolNormalizedEntry,
            };
            const toolPatchWithKey: PatchTypeWithKey = patchWithKey(
              toolPatch,
              p.executionProcess.id,
              0
            );

            entries.push(toolPatchWithKey);

            // Add execution end marker for completed script processes (skip Setup/Cleanup)
            if (
              !skipTimestamps &&
              executionProcess?.status !== ExecutionProcessStatus.running &&
              executionProcess?.started_at &&
              executionProcess?.completed_at
            ) {
              entries.push(
                executionEndPatch(
                  p.executionProcess.id,
                  processName,
                  executionProcess.started_at,
                  executionProcess.completed_at,
                  executionProcess.status
                )
              );
            }
          }

          return entries;
        });

      // Emit the next action bar if no process running
      if (!hasRunningProcess && !hasPendingApproval) {
        allEntries.push(
          nextActionPatch(
            lastProcessFailedOrKilled,
            Object.keys(executionProcessState).length,
            needsSetup
          )
        );
      }

      return allEntries;
    },
    []
  );

  const emitEntries = useCallback(
    (
      executionProcessState: ExecutionProcessStateStore,
      addEntryType: AddEntryType,
      loading: boolean
    ) => {
      const entries = flattenEntriesForEmit(executionProcessState);
      onEntriesUpdatedRef.current?.(entries, addEntryType, loading);
    },
    [flattenEntriesForEmit]
  );

  // This emits its own events as they are streamed
  const loadRunningAndEmit = useCallback(
    (executionProcess: ExecutionProcess): Promise<void> => {
      return new Promise((resolve, reject) => {
        const processId = executionProcess.id;

        // Guard: If already streaming this process, don't create another connection
        if (activeStreamControllers.current.has(processId)) {
          resolve(); // Already streaming, no-op
          return;
        }

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
            activeStreamControllers.current.delete(processId); // Clean up tracking
            emitEntries(displayedExecutionProcesses.current, 'running', false);
            controller.close();
            resolve();
          },
          onError: () => {
            activeStreamControllers.current.delete(processId); // Clean up tracking
            controller.close();
            reject();
          },
        });

        // Track this controller
        activeStreamControllers.current.set(processId, controller);
      });
    },
    [emitEntries]
  );

  // Sometimes it can take a few seconds for the stream to start, wrap the loadRunningAndEmit method
  // The abortSignal allows cleanup to stop the retry loop
  const loadRunningAndEmitWithBackoff = useCallback(
    async (
      executionProcess: ExecutionProcess,
      abortSignal?: { aborted: boolean }
    ) => {
      for (let i = 0; i < 20; i++) {
        if (abortSignal?.aborted) return;
        try {
          await loadRunningAndEmit(executionProcess);
          break;
        } catch (_) {
          if (abortSignal?.aborted) return;
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
    },
    [loadRunningAndEmit]
  );

  const loadInitialEntries =
    useCallback(async (): Promise<ExecutionProcessStateStore> => {
      const localDisplayedExecutionProcesses: ExecutionProcessStateStore = {};

      if (!executionProcesses?.current) return localDisplayedExecutionProcesses;

      // Use current pagination settings from ref
      const { minInitialEntries: targetMinEntries } = paginationRef.current;

      for (const executionProcess of [
        ...executionProcesses.current,
      ].reverse()) {
        if (executionProcess.status === ExecutionProcessStatus.running)
          continue;

        const entries =
          await loadEntriesForHistoricExecutionProcess(executionProcess);
        const entriesWithKey = entries.map((e, idx) =>
          patchWithKey(e, executionProcess.id, idx)
        );

        localDisplayedExecutionProcesses[executionProcess.id] = {
          executionProcess,
          entries: entriesWithKey,
        };

        if (
          flattenEntries(localDisplayedExecutionProcesses).length >
          targetMinEntries
        ) {
          break;
        }
      }

      return localDisplayedExecutionProcesses;
    }, [executionProcesses, loadEntriesForHistoricExecutionProcess]);

  const loadRemainingEntriesInBatches = useCallback(
    async (batchSize: number): Promise<boolean> => {
      if (!executionProcesses?.current) return false;

      let anyUpdated = false;
      for (const executionProcess of [
        ...executionProcesses.current,
      ].reverse()) {
        const current = displayedExecutionProcesses.current;
        if (
          current[executionProcess.id] ||
          executionProcess.status === ExecutionProcessStatus.running
        )
          continue;

        const entries =
          await loadEntriesForHistoricExecutionProcess(executionProcess);
        const entriesWithKey = entries.map((e, idx) =>
          patchWithKey(e, executionProcess.id, idx)
        );

        mergeIntoDisplayed((state) => {
          state[executionProcess.id] = {
            executionProcess,
            entries: entriesWithKey,
          };
        });

        if (
          flattenEntries(displayedExecutionProcesses.current).length > batchSize
        ) {
          anyUpdated = true;
          break;
        }
        anyUpdated = true;
      }
      return anyUpdated;
    },
    [executionProcesses, loadEntriesForHistoricExecutionProcess]
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

  /**
   * Load logs for a remote attempt via the Hive.
   * This is used when origin_node_id is set (attempt executed on different node).
   */
  const loadRemoteAttemptLogs = useCallback(async (): Promise<boolean> => {
    try {
      const result = await logsApi.getByAttemptId(attempt.id, {
        limit: effectiveLimit,
        direction: 'backward',
      });

      if (result.entries.length === 0) {
        return false;
      }

      // Reverse entries to chronological order
      const chronologicalEntries = [...result.entries].reverse();

      // Convert to patches - use attempt.id as a synthetic execution process id
      // logEntriesToPatches already adds patchKey and executionProcessId
      const entriesWithKey = logEntriesToPatches(
        chronologicalEntries,
        attempt.id
      );

      // Validate executor against BaseCodingAgent enum
      const validExecutors = Object.values(BaseCodingAgent);
      const executor = validExecutors.includes(
        attempt.executor as BaseCodingAgent
      )
        ? (attempt.executor as BaseCodingAgent)
        : BaseCodingAgent.CLAUDE_CODE; // Default fallback

      // Create a synthetic execution process state for remote logs
      mergeIntoDisplayed((state) => {
        state[attempt.id] = {
          executionProcess: {
            id: attempt.id,
            created_at: attempt.created_at,
            updated_at: attempt.updated_at,
            executor_action: {
              typ: {
                type: 'CodingAgentInitialRequest',
                prompt: '',
                executor_profile_id: {
                  executor,
                  variant: null,
                },
              },
              next_action: null,
            },
          },
          entries: entriesWithKey,
        };
      });

      return true;
    } catch (err) {
      console.warn('Error loading remote attempt logs:', err);
      return false;
    }
  }, [
    attempt.id,
    attempt.created_at,
    attempt.updated_at,
    attempt.executor,
    effectiveLimit,
  ]);

  // Initial load when attempt changes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Check if this is a remote attempt (executed on a different node)
      const isRemoteAttempt = !!attempt.origin_node_id;

      // For remote attempts with no local execution processes, load from Hive
      if (isRemoteAttempt && executionProcesses?.current.length === 0) {
        if (loadedInitialEntries.current) return;

        const loaded = await loadRemoteAttemptLogs();
        if (cancelled) return;
        if (loaded) {
          emitEntries(displayedExecutionProcesses.current, 'initial', false);
          loadedInitialEntries.current = true;
        }
        return;
      }

      // Still waiting for the execution-processes WebSocket to deliver its initial snapshot
      if (isExecutionProcessesLoading) return;

      if (loadedInitialEntries.current) return;

      // WebSocket connected but no execution processes exist for this attempt.
      // Emit the empty next-action state so the UI exits the loading spinner.
      // Do NOT set loadedInitialEntries here — when the WS is just slow to send
      // its initial snapshot the process list can be transiently empty, and we
      // need the effect to re-run once the real snapshot arrives (idListKey change).
      if (executionProcesses?.current.length === 0) {
        emitEntries(displayedExecutionProcesses.current, 'initial', false);
        return;
      }

      // Initial entries
      const allInitialEntries = await loadInitialEntries();
      if (cancelled) return;
      mergeIntoDisplayed((state) => {
        Object.assign(state, allInitialEntries);
      });
      emitEntries(displayedExecutionProcesses.current, 'initial', false);
      loadedInitialEntries.current = true;

      // Then load the remaining in batches (using current pagination settings)
      while (
        !cancelled &&
        (await loadRemainingEntriesInBatches(paginationRef.current.batchSize))
      ) {
        if (cancelled) return;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
      emitEntries(displayedExecutionProcesses.current, 'historic', false);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    attempt.id,
    attempt.origin_node_id,
    idListKey,
    isExecutionProcessesLoading,
    loadInitialEntries,
    loadRemoteAttemptLogs,
    loadRemainingEntriesInBatches,
    emitEntries,
  ]); // include idListKey so new processes trigger reload; isExecutionProcessesLoading so we react when WS connects with empty list

  useEffect(() => {
    // Create abort signal for cleanup
    const abortSignal = { aborted: false };

    const activeProcess = getActiveAgentProcess();
    if (!activeProcess) return;

    if (!displayedExecutionProcesses.current[activeProcess.id]) {
      const runningOrInitial =
        Object.keys(displayedExecutionProcesses.current).length > 1
          ? 'running'
          : 'initial';
      ensureProcessVisible(activeProcess);
      emitEntries(displayedExecutionProcesses.current, runningOrInitial, false);
    }

    if (
      activeProcess.status === ExecutionProcessStatus.running &&
      lastActiveProcessId.current !== activeProcess.id
    ) {
      lastActiveProcessId.current = activeProcess.id;
      loadRunningAndEmitWithBackoff(activeProcess, abortSignal);
    }

    // Capture ref value for cleanup (React lint rule)
    const controllersMap = activeStreamControllers.current;

    // Cleanup: Close active streams and abort retry loops when effect re-runs or unmounts
    return () => {
      abortSignal.aborted = true;
      for (const controller of controllersMap.values()) {
        controller.close();
      }
      controllersMap.clear();
    };
  }, [
    attempt.id,
    idStatusKey,
    emitEntries,
    ensureProcessVisible,
    loadRunningAndEmitWithBackoff,
  ]);

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
  }, [attempt.id, idListKey, executionProcessesRaw]);

  // Reset state when attempt changes
  useEffect(() => {
    displayedExecutionProcesses.current = {};
    loadedInitialEntries.current = false;
    lastActiveProcessId.current = null;
    emitEntries(displayedExecutionProcesses.current, 'initial', true);
  }, [attempt.id, emitEntries]);

  return {};
};

const formatReviewPrompt = (target: CodingAgentReviewTarget): string => {
  switch (target.type) {
    case 'uncommitted_changes':
      return 'Review uncommitted changes';
    case 'base_branch':
      return `Review changes against \`${target.branch}\``;
    case 'commit':
      return target.title
        ? `Review commit \`${target.sha}\` (${target.title})`
        : `Review commit \`${target.sha}\``;
    case 'custom':
      return target.instructions;
  }
};
