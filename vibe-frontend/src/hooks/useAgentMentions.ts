import { useMemo, useCallback } from 'react';
import { useUserSystem } from '@/components/ConfigProvider';
import type { ExecutorProfileId, BaseCodingAgent, ExecutorConfig } from 'shared/types';

export interface AgentMention {
  trigger: string;
  executor: BaseCodingAgent;
  variant: string | null;
  displayName: string;
  available: boolean;
}

interface ParsedMention {
  agent: AgentMention | null;
  cleanPrompt: string;
}

// Map of common @mention triggers to executor profiles
function buildAgentMentions(
  profiles: Record<string, ExecutorConfig> | null
): AgentMention[] {
  if (!profiles) return [];

  const mentions: AgentMention[] = [];

  for (const [executor, config] of Object.entries(profiles)) {
    // Add base agent mention (e.g., @claude, @gemini)
    const baseTrigger = `@${executor.toLowerCase().replace(/_/g, '-')}`;
    mentions.push({
      trigger: baseTrigger,
      executor: executor as BaseCodingAgent,
      variant: null,
      displayName: executor.replace(/_/g, ' '),
      available: true,
    });

    // Add variant mentions if available (e.g., @claude-opus, @gemini-pro)
    if (config && typeof config === 'object' && 'configs' in config) {
      const configs = config.configs as Record<string, unknown> | undefined;
      if (configs) {
        for (const variant of Object.keys(configs)) {
          if (variant.toLowerCase() !== 'default') {
            const variantTrigger = `${baseTrigger}-${variant.toLowerCase()}`;
            mentions.push({
              trigger: variantTrigger,
              executor: executor as BaseCodingAgent,
              variant,
              displayName: `${executor.replace(/_/g, ' ')} (${variant})`,
              available: true,
            });
          }
        }
      }
    }
  }

  return mentions.sort((a, b) => a.trigger.localeCompare(b.trigger));
}

export function useAgentMentions() {
  const { profiles, config } = useUserSystem();

  const agentMentions = useMemo(() => buildAgentMentions(profiles), [profiles]);

  const defaultProfile: ExecutorProfileId | null = useMemo(() => {
    return config?.executor_profile ?? null;
  }, [config?.executor_profile]);

  const filterMentions = useCallback(
    (searchTerm: string): AgentMention[] => {
      if (!searchTerm) return agentMentions;
      const lowerSearch = searchTerm.toLowerCase();
      return agentMentions.filter(
        (m) =>
          m.trigger.toLowerCase().includes(lowerSearch) ||
          m.displayName.toLowerCase().includes(lowerSearch)
      );
    },
    [agentMentions]
  );

  const parseMentions = useCallback(
    (text: string): ParsedMention => {
      // Find @mentions in the text
      const mentionRegex = /@[\w-]+/g;
      const matches = text.match(mentionRegex);

      if (!matches || matches.length === 0) {
        return { agent: null, cleanPrompt: text.trim() };
      }

      // Use the first @mention found
      const mention = matches[0].toLowerCase();
      const matchedAgent = agentMentions.find(
        (m) => m.trigger.toLowerCase() === mention
      );

      // Remove all @mentions from the prompt
      const cleanPrompt = text.replace(mentionRegex, '').trim();

      return {
        agent: matchedAgent || null,
        cleanPrompt,
      };
    },
    [agentMentions]
  );

  const resolveMentionToProfile = useCallback(
    (mention: AgentMention | null): ExecutorProfileId | null => {
      if (!mention) return defaultProfile;
      return {
        executor: mention.executor,
        variant: mention.variant,
      };
    },
    [defaultProfile]
  );

  const getMentionPosition = useCallback(
    (text: string, cursorPosition: number): { start: number; searchTerm: string } | null => {
      // Find if we're currently in an @mention
      const beforeCursor = text.slice(0, cursorPosition);
      const atIndex = beforeCursor.lastIndexOf('@');

      if (atIndex === -1) return null;

      // Check if there's a space between @ and cursor
      const textAfterAt = beforeCursor.slice(atIndex + 1);
      if (textAfterAt.includes(' ')) return null;

      return {
        start: atIndex,
        searchTerm: textAfterAt,
      };
    },
    []
  );

  return {
    agentMentions,
    defaultProfile,
    filterMentions,
    parseMentions,
    resolveMentionToProfile,
    getMentionPosition,
  };
}
