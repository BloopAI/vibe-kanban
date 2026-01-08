import { useRef } from 'react';
import { CheckIcon, PaperclipIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { toPrettyCase } from '@/utils/string';
import type { BaseCodingAgent } from 'shared/types';
import type { LocalImageMetadata } from '@/components/ui/wysiwyg/context/task-attempt-context';
import { AgentIcon } from '@/components/agents/AgentIcon';
import {
  ChatBoxBase,
  VisualVariant,
  type EditorProps,
  type VariantProps,
} from './ChatBoxBase';
import { PrimaryButton } from './PrimaryButton';
import { ToolbarDropdown, ToolbarIconButton } from './Toolbar';
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
  onPasteFiles?: (files: File[]) => void;
  /** Local images for immediate preview (before saved to server) */
  localImages?: LocalImageMetadata[];
}

/**
 * Lightweight chat box for create mode.
 * Supports sending and attachments - no queue, stop, or feedback functionality.
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
  onPasteFiles,
  localImages,
}: CreateChatBoxProps) {
  const { t } = useTranslation('tasks');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canSend = editor.value.trim().length > 0 && !isSending;

  const handleCmdEnter = () => {
    if (canSend) {
      onSend();
    }
  };

  const handleAttachClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter((f) =>
      f.type.startsWith('image/')
    );
    if (files.length > 0 && onPasteFiles) {
      onPasteFiles(files);
    }
    e.target.value = '';
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
      autoFocus
      variant={variant}
      error={error}
      visualVariant={VisualVariant.NORMAL}
      onPasteFiles={onPasteFiles}
      localImages={localImages}
      headerLeft={
        <>
          <AgentIcon agent={agent} className="size-icon-xl" />
          <ToolbarDropdown label={executorLabel}>
            <DropdownMenuLabel>{t('conversation.executors')}</DropdownMenuLabel>
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
        </>
      }
      footerLeft={
        <>
          <ToolbarIconButton
            icon={PaperclipIcon}
            aria-label="Attach file"
            onClick={handleAttachClick}
            disabled={isSending}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileInputChange}
          />
        </>
      }
      footerRight={
        <PrimaryButton
          onClick={onSend}
          disabled={!canSend}
          actionIcon={isSending ? 'spinner' : undefined}
          value={
            isSending
              ? t('conversation.workspace.creating')
              : t('conversation.workspace.create')
          }
        />
      }
    />
  );
}
