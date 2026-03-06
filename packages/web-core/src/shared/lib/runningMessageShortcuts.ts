import type { Config, RunningMessageShortcut } from 'shared/types';

import { getModifierKey } from '@/shared/lib/platform';

export const DEFAULT_STEER_MESSAGE_SHORTCUT: RunningMessageShortcut =
  'ModifierEnter';
export const DEFAULT_QUEUE_MESSAGE_SHORTCUT: RunningMessageShortcut =
  'ShiftEnter';

type RunningMessageShortcutConfig = Pick<
  Config,
  'steer_message_shortcut' | 'queue_message_shortcut'
>;

export function normalizeRunningMessageShortcuts(
  config?: Partial<RunningMessageShortcutConfig> | null
): {
  steer: RunningMessageShortcut;
  queue: RunningMessageShortcut;
} {
  const steer =
    config?.steer_message_shortcut ?? DEFAULT_STEER_MESSAGE_SHORTCUT;
  let queue = config?.queue_message_shortcut ?? DEFAULT_QUEUE_MESSAGE_SHORTCUT;

  // Prevent ambiguous runtime bindings if config was hand-edited into a duplicate.
  if (steer === queue && steer !== 'Disabled') {
    queue =
      DEFAULT_QUEUE_MESSAGE_SHORTCUT === steer
        ? 'Disabled'
        : DEFAULT_QUEUE_MESSAGE_SHORTCUT;
  }

  return { steer, queue };
}

export function formatRunningMessageShortcut(
  shortcut: RunningMessageShortcut,
  options?: {
    modifierKey?: string;
    disabledLabel?: string;
  }
): string {
  const modifierKey = options?.modifierKey ?? getModifierKey();
  const disabledLabel = options?.disabledLabel ?? 'Disabled';

  switch (shortcut) {
    case 'ModifierEnter':
      return `${modifierKey}+Enter`;
    case 'ShiftEnter':
      return 'Shift+Enter';
    case 'ModifierShiftEnter':
      return `${modifierKey}+Shift+Enter`;
    case 'Disabled':
      return disabledLabel;
    default:
      return `${modifierKey}+Enter`;
  }
}
