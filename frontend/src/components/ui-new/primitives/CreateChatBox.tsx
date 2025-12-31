import { CheckIcon, PaperPlaneTiltIcon } from '@phosphor-icons/react';
import { toPrettyCase } from '@/utils/string';
import type { BaseCodingAgent } from 'shared/types';
import {
  ChatBoxBase,
  type EditorProps,
  type VariantProps,
} from './ChatBoxBase';
import { PrimaryButton } from './PrimaryButton';
import { ToolbarDropdown } from './Toolbar';
import { DropdownMenuItem, DropdownMenuLabel } from './Dropdown';

export interface ExecutorProps {
  selected: BaseCodingAgent | null;
  options: BaseCodingAgent[];
  onChange: (executor: BaseCodingAgent) => void;
}

interface CreateChatBoxProps {
  editor: EditorProps;
  onSend: () => void;
  isSending: boolean;
  executor: ExecutorProps;
  variant?: VariantProps;
  error?: string | null;
  projectId?: string;
  agent?: BaseCodingAgent | null;
}

/**
 * Lightweight chat box for create mode.
 * Only supports sending - no queue, stop, attach, or feedback functionality.
 */
export function CreateChatBox({
  editor,
  onSend,
  isSending,
  executor,
  variant,
  error,
  projectId,
  agent,
}: CreateChatBoxProps) {
  const canSend = editor.value.trim().length > 0 && !isSending;

  const handleCmdEnter = () => {
    if (canSend) {
      onSend();
    }
  };

  const executorLabel = executor.selected
    ? toPrettyCase(executor.selected)
    : 'Select Executor';

  return (
    <ChatBoxBase
      editor={editor}
      placeholder="Describe the task..."
      onCmdEnter={handleCmdEnter}
      disabled={isSending}
      projectId={projectId}
      variant={variant}
      agent={agent}
      error={error}
      headerRight={
        <ToolbarDropdown label={executorLabel}>
          <DropdownMenuLabel>Executors</DropdownMenuLabel>
          {executor.options.map((exec) => (
            <DropdownMenuItem
              key={exec}
              icon={executor.selected === exec ? CheckIcon : undefined}
              onClick={() => executor.onChange(exec)}
            >
              {toPrettyCase(exec)}
            </DropdownMenuItem>
          ))}
        </ToolbarDropdown>
      }
      footerRight={
        <PrimaryButton
          onClick={onSend}
          disabled={!canSend}
          actionIcon={isSending ? 'spinner' : PaperPlaneTiltIcon}
          value={isSending ? 'Creating...' : 'Create'}
        />
      }
    />
  );
}
