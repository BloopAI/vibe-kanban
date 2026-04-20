import { ExecutionProcessStatus, type ExecutionProcess } from 'shared/types';

import type {
  ConversationTimelineSource,
  ExecutionProcessState,
  PatchTypeWithKey,
} from '@/shared/hooks/useConversationHistory/types';

export type ConversationSemanticProcessKind = 'agent' | 'script' | 'unknown';

export interface ConversationSemanticProcessItem {
  readonly executionProcessId: string;
  readonly executionProcess: ExecutionProcessState['executionProcess'];
  readonly kind: ConversationSemanticProcessKind;
  readonly liveExecutionProcess: ExecutionProcess | null;
  readonly rawEntries: PatchTypeWithKey[];
  readonly visibleEntries: PatchTypeWithKey[];
  readonly latestTokenUsageEntry: PatchTypeWithKey | null;
  readonly hasPendingApprovalEntry: boolean;
  readonly isRunning: boolean;
  readonly failedOrKilled: boolean;
}

export interface ConversationSemanticTimeline {
  readonly processes: ConversationSemanticProcessItem[];
  readonly hasSetupScriptProcess: boolean;
  readonly hasSetupScriptWithPrompt: boolean;
}

function extractPromptFromActionChain(
  action: ExecutionProcessState['executionProcess']['executor_action'] | null
): string | null {
  let current = action;
  while (current) {
    const typ = current.typ;
    if (
      typ.type === 'CodingAgentInitialRequest' ||
      typ.type === 'CodingAgentFollowUpRequest' ||
      typ.type === 'ReviewRequest'
    ) {
      return typ.prompt;
    }
    current = current.next_action;
  }
  return null;
}

// This is the first semantic reshape after the raw source model.
// It keeps process-level information but removes direct store traversal from later stages.

function toConversationSemanticProcessKind(
  executionProcess: ExecutionProcessState['executionProcess']
): ConversationSemanticProcessKind {
  const actionType = executionProcess.executor_action.typ.type;

  if (
    actionType === 'CodingAgentInitialRequest' ||
    actionType === 'CodingAgentFollowUpRequest' ||
    actionType === 'ReviewRequest'
  ) {
    return 'agent';
  }

  if (actionType === 'ScriptRequest') {
    return 'script';
  }

  return 'unknown';
}

export function deriveConversationSemanticTimeline(
  source: ConversationTimelineSource
): ConversationSemanticTimeline {
  const liveExecutionProcessesById = new Map(
    source.liveExecutionProcesses.map((process) => [process.id, process])
  );

  const processes = Object.values(source.executionProcessState)
    .sort(
      (a, b) =>
        new Date(a.executionProcess.created_at as unknown as string).getTime() -
        new Date(b.executionProcess.created_at as unknown as string).getTime()
    )
    .map((processState) => {
      const executionProcessId = processState.executionProcess.id;
      const liveExecutionProcess =
        liveExecutionProcessesById.get(executionProcessId) ?? null;
      const latestTokenUsageEntry =
        processState.entries.findLast(
          (entry) =>
            entry.type === 'NORMALIZED_ENTRY' &&
            entry.content.entry_type.type === 'token_usage_info'
        ) ?? null;

      // Normally user messages are derived from the turn's DB-backed
      // `prompt` column (rendered once at the top of the turn), so any
      // `user_message` normalized entry streamed from an agent's
      // stdout is just a duplicate and gets filtered out.
      //
      // CURSOR_MCP breaks that assumption: there is a single
      // long-lived placeholder process per session and user replies
      // are injected into its MsgStore from
      // `/api/cursor-mcp/sessions/{id}/resolve`. There's no DB turn
      // row per reply, so `user_message` entries are the ONLY source
      // of user text in the conversation. Keep them visible.
      const executorActionTyp = processState.executionProcess.executor_action
        .typ as { type: string; executor_config?: { executor?: string } };
      const isCursorMcpProcess =
        (executorActionTyp.type === 'CodingAgentInitialRequest' ||
          executorActionTyp.type === 'CodingAgentFollowUpRequest') &&
        executorActionTyp.executor_config?.executor === 'CURSOR_MCP';

      const visibleEntries = processState.entries.filter(
        (entry) =>
          entry.type !== 'NORMALIZED_ENTRY' ||
          ((isCursorMcpProcess ||
            entry.content.entry_type.type !== 'user_message') &&
            entry.content.entry_type.type !== 'token_usage_info')
      );

      const hasPendingApprovalEntry = visibleEntries.some((entry) => {
        if (entry.type !== 'NORMALIZED_ENTRY') return false;
        const entryType = entry.content.entry_type;
        return (
          entryType.type === 'tool_use' &&
          entryType.status.status === 'pending_approval'
        );
      });

      return {
        executionProcessId,
        executionProcess: processState.executionProcess,
        kind: toConversationSemanticProcessKind(processState.executionProcess),
        liveExecutionProcess,
        rawEntries: processState.entries,
        visibleEntries,
        latestTokenUsageEntry,
        hasPendingApprovalEntry,
        isRunning:
          liveExecutionProcess?.status === ExecutionProcessStatus.running,
        failedOrKilled:
          liveExecutionProcess?.status === ExecutionProcessStatus.failed ||
          liveExecutionProcess?.status === ExecutionProcessStatus.killed,
      } satisfies ConversationSemanticProcessItem;
    });

  return {
    processes,
    hasSetupScriptProcess: processes.some(
      (process) =>
        process.executionProcess.executor_action.typ.type === 'ScriptRequest' &&
        process.executionProcess.executor_action.typ.context === 'SetupScript'
    ),
    hasSetupScriptWithPrompt: processes.some(
      (process) =>
        process.executionProcess.executor_action.typ.type === 'ScriptRequest' &&
        process.executionProcess.executor_action.typ.context ===
          'SetupScript' &&
        extractPromptFromActionChain(
          process.executionProcess.executor_action
        ) !== null
    ),
  };
}
