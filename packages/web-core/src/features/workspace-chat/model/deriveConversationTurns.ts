import {
  type CommandExitStatus,
  type ExecutorAction,
  type TokenUsageInfo,
  type ToolStatus,
} from 'shared/types';

import type { ConversationSemanticProcessItem } from './deriveConversationSemanticTimeline';
import { deriveConversationSemanticTimeline } from './deriveConversationSemanticTimeline';
import type { ConversationTimelineSource } from '@/shared/hooks/useConversationHistory/types';

type ScriptTurnKind =
  | 'setup_script'
  | 'cleanup_script'
  | 'archive_script'
  | 'tool_install_script';

export interface ConversationAgentTurn {
  readonly key: string;
  readonly kind:
    | 'agent_idle'
    | 'agent_running'
    | 'agent_pending_approval'
    | 'agent_failed';
  readonly process: ConversationSemanticProcessItem;
  readonly prompt: string | null;
  readonly shouldEmitUserMessage: boolean;
  readonly visibleEntries: ConversationSemanticProcessItem['visibleEntries'];
  readonly latestTokenUsageInfo: TokenUsageInfo | null;
  readonly shouldEmitLoading: boolean;
  readonly failedOrKilled: boolean;
  readonly needsSetup: boolean;
  readonly setupHelpText?: string;
}

export interface ConversationScriptTurnProcess {
  readonly process: ConversationSemanticProcessItem;
  readonly toolName: string;
  readonly exitStatus: CommandExitStatus | null;
  readonly toolStatus: ToolStatus;
  readonly shouldEmitInitialPromptAfterSetup: boolean;
  readonly initialPromptAfterSetup: string | null;
}

export interface ConversationScriptTurn {
  readonly key: string;
  readonly kind: ScriptTurnKind;
  readonly processes: ReadonlyArray<ConversationScriptTurnProcess>;
}

export type ConversationTurn = ConversationAgentTurn | ConversationScriptTurn;

export interface ConversationTurns {
  readonly turns: ConversationTurn[];
  readonly hasSetupScriptProcess: boolean;
  readonly hasSetupScriptWithPrompt: boolean;
}

// Turns are the first product-shaped model in the pipeline.
// From this point on, the code reasons about conversation meaning instead of raw process order.

function isAgentTurn(turn: ConversationTurn): turn is ConversationAgentTurn {
  return (
    turn.kind === 'agent_idle' ||
    turn.kind === 'agent_running' ||
    turn.kind === 'agent_pending_approval' ||
    turn.kind === 'agent_failed'
  );
}

function getPromptFromActionChain(
  action: ExecutorAction | null
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

function getLatestTokenUsageInfo(
  process: ConversationSemanticProcessItem
): TokenUsageInfo | null {
  if (process.latestTokenUsageEntry?.type !== 'NORMALIZED_ENTRY') {
    return null;
  }

  return process.latestTokenUsageEntry.content.entry_type as TokenUsageInfo;
}

function getSetupRequiredHelp(
  process: ConversationSemanticProcessItem
): string | undefined {
  const setupRequiredEntry = process.visibleEntries.find((entry) => {
    if (entry.type !== 'NORMALIZED_ENTRY') return false;
    return (
      entry.content.entry_type.type === 'error_message' &&
      entry.content.entry_type.error_type.type === 'setup_required'
    );
  });

  return setupRequiredEntry?.type === 'NORMALIZED_ENTRY'
    ? setupRequiredEntry.content.content
    : undefined;
}

function deriveAgentTurn(
  process: ConversationSemanticProcessItem,
  hasSetupScriptWithPrompt: boolean,
  isLastTurn: boolean
): ConversationAgentTurn {
  const executorActionType = process.executionProcess.executor_action.typ;
  const prompt = getPromptFromActionChain(
    process.executionProcess.executor_action
  );
  const setupHelpText = process.failedOrKilled
    ? getSetupRequiredHelp(process)
    : undefined;
  const needsSetup = Boolean(setupHelpText);
  const shouldEmitUserMessage = !(
    executorActionType.type === 'CodingAgentInitialRequest' &&
    hasSetupScriptWithPrompt
  );

  if (process.hasPendingApprovalEntry) {
    return {
      key: process.executionProcessId,
      kind: 'agent_pending_approval',
      process,
      prompt,
      shouldEmitUserMessage,
      visibleEntries: process.visibleEntries,
      latestTokenUsageInfo: getLatestTokenUsageInfo(process),
      shouldEmitLoading: false,
      failedOrKilled: process.failedOrKilled && isLastTurn,
      needsSetup: isLastTurn ? needsSetup : false,
      setupHelpText: isLastTurn ? setupHelpText : undefined,
    };
  }

  if (process.isRunning) {
    return {
      key: process.executionProcessId,
      kind: 'agent_running',
      process,
      prompt,
      shouldEmitUserMessage,
      visibleEntries: process.visibleEntries,
      latestTokenUsageInfo: getLatestTokenUsageInfo(process),
      shouldEmitLoading: true,
      failedOrKilled: false,
      needsSetup: false,
    };
  }

  if (process.failedOrKilled && isLastTurn) {
    return {
      key: process.executionProcessId,
      kind: 'agent_failed',
      process,
      prompt,
      shouldEmitUserMessage,
      visibleEntries: process.visibleEntries,
      latestTokenUsageInfo: getLatestTokenUsageInfo(process),
      shouldEmitLoading: false,
      failedOrKilled: true,
      needsSetup,
      setupHelpText,
    };
  }

  return {
    key: process.executionProcessId,
    kind: 'agent_idle',
    process,
    prompt,
    shouldEmitUserMessage,
    visibleEntries: process.visibleEntries,
    latestTokenUsageInfo: getLatestTokenUsageInfo(process),
    shouldEmitLoading: false,
    failedOrKilled: false,
    needsSetup: false,
  };
}

function toScriptTurnKind(
  process: ConversationSemanticProcessItem
): ScriptTurnKind | null {
  const action = process.executionProcess.executor_action.typ;
  if (action.type !== 'ScriptRequest') return null;

  switch (action.context) {
    case 'SetupScript':
      return 'setup_script';
    case 'CleanupScript':
      return 'cleanup_script';
    case 'ArchiveScript':
      return 'archive_script';
    case 'ToolInstallScript':
      return 'tool_install_script';
    default:
      return null;
  }
}

function toScriptToolName(kind: ScriptTurnKind): string {
  switch (kind) {
    case 'setup_script':
      return 'Setup Script';
    case 'cleanup_script':
      return 'Cleanup Script';
    case 'archive_script':
      return 'Archive Script';
    case 'tool_install_script':
      return 'Tool Install Script';
  }
}

function deriveScriptTurnProcess(
  process: ConversationSemanticProcessItem,
  kind: ScriptTurnKind,
  isFirstTurn: boolean
): ConversationScriptTurnProcess {
  const exitCode = Number(process.liveExecutionProcess?.exit_code) || 0;
  const exitStatus: CommandExitStatus | null = process.isRunning
    ? null
    : {
        type: 'exit_code',
        code: exitCode,
      };
  const toolStatus: ToolStatus = process.isRunning
    ? { status: 'created' }
    : exitCode === 0
      ? { status: 'success' }
      : { status: 'failed' };

  const shouldEmitInitialPromptAfterSetup =
    kind === 'setup_script' && isFirstTurn && !process.isRunning;

  return {
    process,
    toolName: toScriptToolName(kind),
    exitStatus,
    toolStatus,
    shouldEmitInitialPromptAfterSetup,
    initialPromptAfterSetup: shouldEmitInitialPromptAfterSetup
      ? getPromptFromActionChain(process.executionProcess.executor_action)
      : null,
  };
}

export function deriveConversationTurns(
  source: ConversationTimelineSource
): ConversationTurns {
  const semanticTimeline = deriveConversationSemanticTimeline(source);
  const turns: ConversationTurn[] = [];
  const typedProcesses = semanticTimeline.processes
    .map((process) => {
      const scriptKind = toScriptTurnKind(process);
      return {
        process,
        scriptKind,
      };
    })
    .filter(
      (
        item
      ): item is {
        process: ConversationSemanticProcessItem;
        scriptKind: ScriptTurnKind | null;
      } => item.process.kind === 'agent' || item.scriptKind !== null
    );

  for (const [index, item] of typedProcesses.entries()) {
    const isLastTurn = index === typedProcesses.length - 1;

    if (item.process.kind === 'agent') {
      turns.push(
        deriveAgentTurn(
          item.process,
          semanticTimeline.hasSetupScriptWithPrompt,
          isLastTurn
        )
      );
      continue;
    }

    const kind = item.scriptKind;
    if (!kind) continue;

    const previousTurn = turns.at(-1);
    if (
      previousTurn &&
      !isAgentTurn(previousTurn) &&
      previousTurn.kind === kind
    ) {
      turns[turns.length - 1] = {
        ...previousTurn,
        processes: [
          ...previousTurn.processes,
          deriveScriptTurnProcess(item.process, kind, index === 0),
        ],
      };
      continue;
    }

    turns.push({
      key: item.process.executionProcessId,
      kind,
      processes: [deriveScriptTurnProcess(item.process, kind, index === 0)],
    });
  }

  return {
    turns,
    hasSetupScriptProcess: semanticTimeline.hasSetupScriptProcess,
    hasSetupScriptWithPrompt: semanticTimeline.hasSetupScriptWithPrompt,
  };
}
