import { useRef } from 'react';
import { CheckIcon, PaperclipIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { toPrettyCase } from '@/utils/string';
import type { BaseCodingAgent } from 'shared/types';
import type { LocalImageMetadata } from '@/components/ui/wysiwyg/context/task-attempt-context';
import { AgentIcon } from '@/components/agents/AgentIcon';
import { Checkbox } from '@/components/ui/checkbox';
import {
  ChatBoxBase,
  VisualVariant,
  type DropzoneProps,
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

export interface SaveAsDefaultProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  visible: boolean;
}

interface CreateChatBoxProps {
  editor: EditorProps;
  onSend: () => void;
  isSending: boolean;
  executor: ExecutorProps;
  variant?: VariantProps;
  saveAsDefault?: SaveAsDefaultProps;
  error?: string | null;
  projectId?: string;
  repoId?: string;
  agent?: BaseCodingAgent | null;
  onPasteFiles?: (files: File[]) => void;
  localImages?: LocalImageMetadata[];
  dropzone?: DropzoneProps;
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
  saveAsDefault,
  error,
  projectId,
  repoId,
  agent,
  onPasteFiles,
  localImages,
  dropzone,
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
      repoId={repoId}
      executor={executor.selected}
      autoFocus
      variant={variant}
      error={error}
      visualVariant={VisualVariant.NORMAL}
      onPasteFiles={onPasteFiles}
      localImages={localImages}
      dropzone={dropzone}
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
          {saveAsDefault?.visible && (
            <label className="flex items-center gap-1.5 text-sm text-low cursor-pointer ml-2">
              <Checkbox
                checked={saveAsDefault.checked}
                onCheckedChange={saveAsDefault.onChange}
                className="h-3.5 w-3.5"
              />
              <span>{t('conversation.saveAsDefault')}</span>
            </label>
          )}
        </>
      }
      footerLeft={
        <>
          <ToolbarIconButton
            icon={PaperclipIcon}
            aria-label={t('tasks:taskFormDialog.attachImage')}
            title={t('tasks:taskFormDialog.attachImage')}
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
