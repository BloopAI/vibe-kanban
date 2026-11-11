import { describe, it, expect } from 'vitest';
import type { ExecutorAction } from 'shared/types';
import type { PatchTypeWithKey } from '@/shared/hooks/useConversationHistory/types';
import { nextActionPatch } from '@/shared/hooks/useConversationHistory/constants';
import { deriveConversationTimeline } from './deriveConversationTimeline';
import { getExecutorProfileFromActionChain } from './deriveConversationTurns';

function visibleTypes(entries: PatchTypeWithKey[]): string[] {
  return deriveConversationTimeline(entries, [], []).displayEntries.map(
    (entry) =>
      entry.type === 'NORMALIZED_ENTRY' ? entry.content.entry_type.type : ''
  );
}

describe('deriveConversationTimeline next_action filter', () => {
  const profile = { executor: 'CURSOR_AGENT', variant: null };

  it('keeps the next-action row when setup is needed', () => {
    expect(
      visibleTypes([nextActionPatch(true, 1, true, 'x', profile)])
    ).toEqual(['next_action']);
  });

  it('drops the next-action row otherwise', () => {
    expect(visibleTypes([nextActionPatch(true, 1, false)])).toEqual([]);
  });
});

function script(next: ExecutorAction | null = null): ExecutorAction {
  return {
    typ: {
      type: 'ScriptRequest',
      script: 'agent login',
      language: 'Bash',
      context: 'ToolInstallScript',
      working_dir: null,
    },
    next_action: next,
  };
}

function followUp(variant?: string | null): ExecutorAction {
  return {
    typ: {
      type: 'CodingAgentFollowUpRequest',
      prompt: 'hi',
      session_id: 's',
      reset_to_message_id: null,
      executor_config: { executor: 'COPILOT', variant },
      working_dir: null,
    },
    next_action: null,
  };
}

describe('getExecutorProfileFromActionChain', () => {
  it('reads executor and variant from a follow-up', () => {
    expect(getExecutorProfileFromActionChain(followUp('PLAN'))).toEqual({
      executor: 'COPILOT',
      variant: 'PLAN',
    });
  });

  it('uses null when the follow-up has no variant', () => {
    expect(getExecutorProfileFromActionChain(followUp())).toEqual({
      executor: 'COPILOT',
      variant: null,
    });
  });

  it('finds the agent request after a setup script', () => {
    expect(getExecutorProfileFromActionChain(script(followUp(null)))).toEqual({
      executor: 'COPILOT',
      variant: null,
    });
  });

  it('returns null for a chain with only a script', () => {
    expect(getExecutorProfileFromActionChain(script())).toBeNull();
  });
});
