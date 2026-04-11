import { NormalizedEntry, PatchType, TokenUsageInfo } from 'shared/types';

import {
  makeLoadingPatch,
  nextActionPatch,
} from '@/shared/hooks/useConversationHistory/constants';
import type { PatchTypeWithKey } from '@/shared/hooks/useConversationHistory/types';
import {
  deriveConversationTurns,
  type ConversationAgentTurn,
  type ConversationScriptTurn,
  type ConversationTurn,
} from './deriveConversationTurns';

export interface DerivedConversationEntriesResult {
  readonly entries: PatchTypeWithKey[];
  readonly hasRunningProcess: boolean;
  readonly hasSetupScriptRun: boolean;
  readonly hasCleanupScriptRun: boolean;
  readonly latestTokenUsageInfo: TokenUsageInfo | null;
}

interface DeriveConversationEntriesParams {
  readonly source: import('@/shared/hooks/useConversationHistory/types').ConversationTimelineSource;
  readonly scriptOutputCache: Map<string, { count: number; output: string }>;
}

function patchWithKey(
  patch: PatchType,
  executionProcessId: string,
  index: number | 'user' | 'script'
): PatchTypeWithKey {
  return {
    ...patch,
    patchKey: `${executionProcessId}:${index}`,
    executionProcessId,
  };
}

function appendAgentTurnEntries(
  turn: ConversationAgentTurn,
  turnEntries: PatchTypeWithKey[]
) {
  if (turn.shouldEmitUserMessage && turn.prompt) {
    const userNormalizedEntry: NormalizedEntry = {
      entry_type: { type: 'user_message' },
      content: turn.prompt,
      timestamp: null,
    };

    turnEntries.push(
      patchWithKey(
        { type: 'NORMALIZED_ENTRY', content: userNormalizedEntry },
        turn.process.executionProcess.id,
        'user'
      )
    );
  }

  turnEntries.push(...turn.visibleEntries);

  if (turn.shouldEmitLoading) {
    turnEntries.push(makeLoadingPatch(turn.process.executionProcess.id));
  }
}

function appendScriptTurnEntries(
  turn: ConversationScriptTurn,
  turnEntries: PatchTypeWithKey[],
  scriptOutputCache: Map<string, { count: number; output: string }>
) {
  for (const process of turn.processes) {
    const processId = process.process.executionProcess.id;
    const entryCount = process.process.rawEntries.length;
    const cachedOutput = scriptOutputCache.get(processId);
    const output =
      cachedOutput && cachedOutput.count === entryCount
        ? cachedOutput.output
        : process.process.rawEntries.map((entry) => entry.content).join('\n');

    scriptOutputCache.set(processId, {
      count: entryCount,
      output,
    });

    const scriptAction = process.process.executionProcess.executor_action.typ;
    if (scriptAction.type !== 'ScriptRequest') {
      continue;
    }

    const toolNormalizedEntry: NormalizedEntry = {
      entry_type: {
        type: 'tool_use',
        tool_name: process.toolName,
        action_type: {
          action: 'command_run',
          command: scriptAction.script,
          result: {
            output,
            exit_status: process.exitStatus,
          },
          category: 'other',
        },
        status: process.toolStatus,
      },
      content: process.toolName,
      timestamp: null,
    };

    turnEntries.push(
      patchWithKey(
        { type: 'NORMALIZED_ENTRY', content: toolNormalizedEntry },
        processId,
        'script'
      )
    );

    if (
      process.shouldEmitInitialPromptAfterSetup &&
      process.initialPromptAfterSetup
    ) {
      turnEntries.push(
        patchWithKey(
          {
            type: 'NORMALIZED_ENTRY',
            content: {
              entry_type: { type: 'user_message' },
              content: process.initialPromptAfterSetup,
              timestamp: null,
            },
          },
          processId,
          'user'
        )
      );
    }
  }
}

function isAgentTurn(turn: ConversationTurn): turn is ConversationAgentTurn {
  return (
    turn.kind === 'agent_idle' ||
    turn.kind === 'agent_running' ||
    turn.kind === 'agent_pending_approval' ||
    turn.kind === 'agent_failed'
  );
}

// This stage serializes already-derived turn meaning into visible conversation entries.

export function deriveConversationEntries({
  source,
  scriptOutputCache,
}: DeriveConversationEntriesParams): DerivedConversationEntriesResult {
  const conversationTurns = deriveConversationTurns(source);

  let hasPendingApproval = false;
  let hasRunningProcess = false;
  let lastProcessFailedOrKilled = false;
  let needsSetup = false;
  let setupHelpText: string | undefined;
  let latestTokenUsageInfo: TokenUsageInfo | null = null;
  let hasSetupScriptRun = false;
  let hasCleanupScriptRun = false;

  const entries = conversationTurns.turns.flatMap((turn, index) => {
    const turnEntries: PatchTypeWithKey[] = [];

    if (isAgentTurn(turn)) {
      if (turn.latestTokenUsageInfo) {
        latestTokenUsageInfo = turn.latestTokenUsageInfo;
      }

      if (turn.kind === 'agent_pending_approval') {
        hasPendingApproval = true;
      }

      if (turn.kind === 'agent_running') {
        hasRunningProcess = true;
      }

      if (
        turn.kind === 'agent_failed' &&
        index === conversationTurns.turns.length - 1
      ) {
        lastProcessFailedOrKilled = true;
        if (turn.needsSetup) {
          needsSetup = true;
          setupHelpText = turn.setupHelpText;
        }
      }

      appendAgentTurnEntries(turn, turnEntries);
      return turnEntries;
    }

    if (turn.kind === 'setup_script') {
      hasSetupScriptRun = true;
    } else if (turn.kind === 'cleanup_script') {
      hasCleanupScriptRun = true;
    }

    if (turn.processes.some((process) => process.process.isRunning)) {
      hasRunningProcess = true;
    }

    if (
      turn.processes.some((process) => process.process.failedOrKilled) &&
      index === conversationTurns.turns.length - 1
    ) {
      lastProcessFailedOrKilled = true;
    }

    appendScriptTurnEntries(turn, turnEntries, scriptOutputCache);
    return turnEntries;
  });

  if (!hasRunningProcess && !hasPendingApproval) {
    entries.push(
      nextActionPatch(
        lastProcessFailedOrKilled,
        conversationTurns.turns.length,
        needsSetup,
        setupHelpText
      )
    );
  }

  return {
    entries,
    hasRunningProcess,
    hasSetupScriptRun,
    hasCleanupScriptRun,
    latestTokenUsageInfo,
  };
}
