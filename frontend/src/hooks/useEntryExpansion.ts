import { useEffect, useMemo, useRef } from 'react';
import type { NormalizedEntry, ActionType } from 'shared/types';
import type { ProcessStartPayload } from '@/types/logs';
import { useExpandableStore } from '@/stores/useExpandableStore';

export type ExpandableConfig = {
  key: string;
  defaultOpen: boolean;
};

type EntryLike = NormalizedEntry | ProcessStartPayload;
type FileEditAction = Extract<ActionType, { action: 'file_edit' }>;

function isProcessStart(entry: EntryLike): entry is ProcessStartPayload {
  return 'processId' in entry;
}

function computeCommandArgsText(
  action: any,
  entryContent?: string,
  contentText?: string
): string | null {
  if (!action) return null;

  const fromArgs =
    typeof action.arguments === 'string'
      ? action.arguments
      : action.arguments != null
        ? JSON.stringify(action.arguments, null, 2)
        : '';

  const fallback = (entryContent || contentText || '').trim();
  const combined = (fromArgs || fallback).trim();

  return combined === '' ? null : combined;
}

function shouldOpenToolCall(params: {
  action: any;
  entryContent?: string;
  contentText?: string;
}) {
  const { action, entryContent, contentText } = params;
  if (!action) return false;

  if (action.action === 'command_run') {
    const argsText = computeCommandArgsText(action, entryContent, contentText);
    const output = action.result?.output ?? null;
    return Boolean(argsText) || Boolean(output);
  }

  if (action.action === 'tool') {
    return Boolean(action.arguments) || Boolean(action.result);
  }

  return false;
}

function getFileEditConfigs(
  fileEdit: FileEditAction,
  expansionKey: string,
  defaultOpen: boolean
): ExpandableConfig[] {
  return fileEdit.changes.map((change, idx) => ({
    key: `edit:${expansionKey}:${idx}`,
    defaultOpen: defaultOpen && change.action === 'write',
  }));
}

function getToolCallConfig(
  action: any,
  expansionKey: string,
  entryContent: string | undefined,
  contentText: string | undefined,
  defaultOpen?: boolean
): ExpandableConfig[] {
  const computedDefault =
    typeof defaultOpen === 'boolean'
      ? defaultOpen
      : shouldOpenToolCall({ action, entryContent, contentText });

  return [
    {
      key: `tool-entry:${expansionKey}`,
      defaultOpen: computedDefault,
    },
  ];
}

function getPlanConfigs(
  expansionKey: string,
  defaultOpen: boolean
): ExpandableConfig[] {
  return [
    {
      key: `plan-entry:${expansionKey}`,
      defaultOpen,
    },
  ];
}

export function getEntryExpandableConfigs(
  entry: EntryLike,
  expansionKey: string
): ExpandableConfig[] {
  const configs: ExpandableConfig[] = [];

  if (isProcessStart(entry)) {
    const action: any = entry.action ?? null;
    if (entry.action) {
      const text = action.message ?? action.summary ?? '';
      configs.push(
        ...getToolCallConfig(entry.action, expansionKey, text, text)
      );
    }
    return configs;
  }

  const entryType = entry.entry_type;

  if (
    entryType.type === 'system_message' ||
    entryType.type === 'error_message'
  ) {
    configs.push({
      key: `entry:${expansionKey}`,
      defaultOpen: false,
    });
    return configs;
  }

  if (entryType.type === 'tool_use') {
    const status = entryType.status;
    const isPendingApproval = status.status === 'pending_approval';
    if (entryType.action_type.action === 'file_edit') {
      configs.push(
        ...getFileEditConfigs(
          entryType.action_type as FileEditAction,
          expansionKey,
          isPendingApproval
        )
      );
      return configs;
    }

    if (entryType.action_type.action === 'plan_presentation') {
      configs.push(...getPlanConfigs(expansionKey, true));
      return configs;
    }

    configs.push(
      ...getToolCallConfig(
        entryType.action_type,
        expansionKey,
        entry.content,
        entry.content,
        isPendingApproval
      )
    );
    return configs;
  }

  return configs;
}

type Options = {
  forceExpand?: boolean;
};

export function useEntryExpansion(
  entry: EntryLike,
  expansionKey: string,
  options: Options = {}
) {
  const { forceExpand = false } = options;
  const setKey = useExpandableStore((s) => s.setKey);
  const appliedDefaultsRef = useRef<Record<string, boolean>>({});
  const trackedExpansionKeyRef = useRef(expansionKey);

  useEffect(() => {
    if (trackedExpansionKeyRef.current !== expansionKey) {
      trackedExpansionKeyRef.current = expansionKey;
      appliedDefaultsRef.current = {};
    }
  }, [expansionKey]);

  const configs = useMemo(
    () => getEntryExpandableConfigs(entry, expansionKey),
    [entry, expansionKey]
  );

  useEffect(() => {
    configs.forEach(({ key, defaultOpen }) => {
      const state = useExpandableStore.getState();

      if (forceExpand) {
        if (state.expanded[key] !== true) setKey(key, true);
        return;
      }

      if (!defaultOpen || appliedDefaultsRef.current[key]) return;
      appliedDefaultsRef.current[key] = true;
      if (Object.prototype.hasOwnProperty.call(state.expanded, key)) return;
      setKey(key, true);
    });
  }, [configs, forceExpand, setKey]);

  return configs;
}
