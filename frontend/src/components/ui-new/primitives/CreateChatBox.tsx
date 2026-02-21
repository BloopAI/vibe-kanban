import { useRef } from 'react';
import { CheckIcon, PaperclipIcon, XIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { toPrettyCase } from '@/utils/string';
import type { BaseCodingAgent, ExecutorConfig } from 'shared/types';
import type { LocalImageMetadata } from '@vibe/ui/components/TaskAttemptContext';
import { AgentIcon } from '@/components/agents/AgentIcon';
import WYSIWYGEditor from '@/components/ui/wysiwyg';
import { useUserSystem } from '@/components/ConfigProvider';
import { Checkbox } from '@vibe/ui/components/Checkbox';
import {
  ChatBoxBase,
  VisualVariant,
  type DropzoneProps,
} from '@vibe/ui/components/ChatBoxBase';
import { PrimaryButton } from '@vibe/ui/components/PrimaryButton';
import {
  ToolbarDropdown,
  ToolbarIconButton,
} from '@vibe/ui/components/Toolbar';
import {
  DropdownMenuItem,
  DropdownMenuLabel,
} from '@vibe/ui/components/Dropdown';
import { ModelSelectorContainer } from '../containers/ModelSelectorContainer';

export interface EditorProps {
  value: string;
  onChange: (value: string) => void;
}

export interface ModelSelectorProps {
  onAdvancedSettings: () => void;
  presets: string[];
  selectedPreset: string | null;
  onPresetSelect: (presetId: string | null) => void;
  onOverrideChange: (partial: Partial<ExecutorConfig>) => void;
  executorConfig: ExecutorConfig | null;
  presetOptions: ExecutorConfig | null | undefined;
}

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

export interface LinkedIssueBadgeProps {
  simpleId: string;
  title: string;
  onRemove: () => void;
}

interface CreateChatBoxProps {
  editor: EditorProps;
  onSend: () => void;
  isSending: boolean;
  disabled?: boolean;
  executor: ExecutorProps;
  saveAsDefault?: SaveAsDefaultProps;
  error?: string | null;
  repoIds?: string[];
  repoId?: string;
  agent?: BaseCodingAgent | null;
  modelSelector?: ModelSelectorProps;
  onPasteFiles?: (files: File[]) => void;
  localImages?: LocalImageMetadata[];
  dropzone?: DropzoneProps;
  onEditRepos: () => void;
  repoSummaryLabel: string;
  repoSummaryTitle: string;
  linkedIssue?: LinkedIssueBadgeProps | null;
}

/**
 * Lightweight chat box for create mode.
 * Supports sending and attachments - no queue, stop, or feedback functionality.
 */
export function CreateChatBox({
  editor,
  onSend,
  isSending,
  disabled = false,
  executor,
  saveAsDefault,
  error,
  repoIds,
  repoId,
  agent,
  modelSelector,
  onPasteFiles,
  localImages,
  dropzone,
  onEditRepos,
  repoSummaryLabel,
  repoSummaryTitle,
  linkedIssue,
}: CreateChatBoxProps) {
  const { t } = useTranslation(['common', 'tasks']);
  const { config } = useUserSystem();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isDisabled = disabled || isSending;
  const canSend = editor.value.trim().length > 0 && !isDisabled;

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
      editor={
        <WYSIWYGEditor
          placeholder="Describe the task..."
          value={editor.value}
          onChange={editor.onChange}
          onCmdEnter={handleCmdEnter}
          disabled={isDisabled}
          className="min-h-double max-h-[50vh] overflow-y-auto"
          repoIds={repoIds}
          repoId={repoId}
          executor={executor.selected ?? null}
          autoFocus
          onPasteFiles={onPasteFiles}
          localImages={localImages}
          sendShortcut={config?.send_message_shortcut}
        />
      }
      error={error}
      visualVariant={VisualVariant.NORMAL}
      dropzone={dropzone}
      modelSelector={
        modelSelector && agent ? (
          <ModelSelectorContainer
            agent={agent}
            workspaceId={undefined}
            onAdvancedSettings={modelSelector.onAdvancedSettings}
            presets={modelSelector.presets}
            selectedPreset={modelSelector.selectedPreset}
            onPresetSelect={modelSelector.onPresetSelect}
            onOverrideChange={modelSelector.onOverrideChange}
            executorConfig={modelSelector.executorConfig}
            presetOptions={modelSelector.presetOptions}
          />
        ) : undefined
      }
      headerLeft={
        <>
          <AgentIcon agent={agent} className="size-icon-xl" />
          <ToolbarDropdown label={executorLabel} disabled={isDisabled}>
            <DropdownMenuLabel>
              {t('tasks:conversation.executors')}
            </DropdownMenuLabel>
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
                disabled={isDisabled}
              />
              <span>{t('tasks:conversation.saveAsDefault')}</span>
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
            disabled={isDisabled}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileInputChange}
          />
          <button
            type="button"
            onClick={onEditRepos}
            title={repoSummaryTitle}
            disabled={isDisabled}
            className="max-w-[320px] truncate text-sm text-normal hover:text-high disabled:cursor-not-allowed disabled:opacity-50"
          >
            {repoSummaryLabel}
          </button>
          {linkedIssue && (
            <>
              <div
                className="inline-flex items-center gap-half whitespace-nowrap text-sm text-low"
                title={linkedIssue.title}
              >
                <span className="font-mono text-xs text-normal">
                  {linkedIssue.simpleId}
                </span>
                <button
                  type="button"
                  onClick={linkedIssue.onRemove}
                  disabled={isDisabled}
                  className="inline-flex items-center text-low hover:text-error transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label={`Remove link to ${linkedIssue.simpleId}`}
                >
                  <XIcon className="size-icon-xs" weight="bold" />
                </button>
              </div>
            </>
          )}
        </>
      }
      footerRight={
        <PrimaryButton
          onClick={onSend}
          disabled={!canSend}
          actionIcon={isSending ? 'spinner' : undefined}
          value={
            isSending
              ? t('tasks:conversation.workspace.creating')
              : t('tasks:conversation.workspace.create')
          }
        />
      }
    />
  );
}
