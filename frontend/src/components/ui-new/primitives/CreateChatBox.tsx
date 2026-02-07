import { useRef } from 'react';
import {
  CheckIcon,
  GearIcon,
  ImageIcon,
  PaperclipIcon,
  XIcon,
} from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { toPrettyCase } from '@/utils/string';
import type { BaseCodingAgent } from 'shared/types';
import type { LocalImageMetadata } from '@/components/ui/wysiwyg/context/task-attempt-context';
import WYSIWYGEditor from '@/components/ui/wysiwyg';
import { useUserSystem } from '@/components/ConfigProvider';
import { AgentIcon } from '@/components/agents/AgentIcon';
import { Checkbox } from '@/components/ui/checkbox';
import {
  type DropzoneProps,
  type EditorProps,
  type VariantProps,
} from './ChatBoxBase';
import { PrimaryButton } from './PrimaryButton';
import { ToolbarDropdown, ToolbarIconButton } from './Toolbar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTriggerButton,
} from './Dropdown';

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
  variant?: VariantProps;
  saveAsDefault?: SaveAsDefaultProps;
  error?: string | null;
  repoIds?: string[];
  projectId?: string;
  repoId?: string;
  agent?: BaseCodingAgent | null;
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
  variant,
  saveAsDefault,
  error,
  repoIds,
  projectId,
  repoId,
  agent,
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
  const variantLabel = toPrettyCase(variant?.selected || 'DEFAULT');
  const variantOptions = variant?.options ?? [];
  const isDragActive = dropzone?.isDragActive ?? false;

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
    <div
      {...(dropzone?.getRootProps() ?? {})}
      className="relative flex w-chat max-w-full flex-col gap-base"
    >
      {dropzone && <input {...dropzone.getInputProps()} />}

      {isDragActive && (
        <div className="absolute inset-0 z-50 flex items-center justify-center rounded-sm border-2 border-dashed border-brand bg-primary/80 backdrop-blur-sm pointer-events-none animate-in fade-in-0 duration-150">
          <div className="text-center">
            <div className="mx-auto mb-2 w-10 h-10 rounded-full bg-brand/10 flex items-center justify-center">
              <ImageIcon className="h-5 w-5 text-brand" />
            </div>
            <p className="text-sm font-medium text-high">
              {t('tasks:dropzone.dropImagesHere')}
            </p>
            <p className="text-xs text-low mt-0.5">
              {t('tasks:dropzone.supportedFormats')}
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-sm border border-error/30 bg-error/10 px-base py-half">
          <p className="text-xs text-error">{error}</p>
        </div>
      )}

      <div className="rounded-sm border border-border bg-secondary p-base">
        <div className="flex items-center gap-base">
          <div className="min-w-0 flex-1 rounded-sm border border-border px-base py-half">
            <WYSIWYGEditor
              placeholder="Describe what you'd like the agent to work on..."
              value={editor.value}
              onChange={editor.onChange}
              onCmdEnter={handleCmdEnter}
              disabled={isDisabled}
              className="min-h-double max-h-[50vh] overflow-y-auto"
              repoIds={repoIds}
              projectId={projectId}
              repoId={repoId}
              executor={executor.selected}
              autoFocus
              onPasteFiles={onPasteFiles}
              localImages={localImages}
              sendShortcut={config?.send_message_shortcut}
            />
          </div>
          <ToolbarIconButton
            icon={PaperclipIcon}
            aria-label={t('tasks:taskFormDialog.attachImage')}
            title={t('tasks:taskFormDialog.attachImage')}
            onClick={handleAttachClick}
            disabled={isDisabled}
            className="shrink-0"
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-base">
        <div className="flex min-w-0 items-center gap-half overflow-x-auto pr-half">
          <div className="inline-flex items-center gap-half">
            <DropdownMenu>
              <DropdownMenuTriggerButton
                disabled={isDisabled}
                className="h-cta hover:bg-panel"
                aria-label={t('tasks:conversation.executors')}
              >
                <div className="flex min-w-0 items-center gap-half">
                  <AgentIcon agent={agent} className="size-icon-base shrink-0" />
                  <span className="max-w-[200px] truncate text-sm text-normal">
                    {executorLabel}
                  </span>
                </div>
              </DropdownMenuTriggerButton>
              <DropdownMenuContent>
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
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {variant && variantOptions.length > 0 && (
            <ToolbarDropdown
              label={variantLabel}
              disabled={isDisabled}
              className="h-cta hover:bg-panel"
            >
              <DropdownMenuLabel>{t('chatBox.variants')}</DropdownMenuLabel>
              {variantOptions.map((variantName) => (
                <DropdownMenuItem
                  key={variantName}
                  icon={
                    variant.selected === variantName ? CheckIcon : undefined
                  }
                  onClick={() => variant.onChange(variantName)}
                >
                  {toPrettyCase(variantName)}
                </DropdownMenuItem>
              ))}
              {variant.onCustomise && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    icon={GearIcon}
                    onClick={variant.onCustomise}
                  >
                    {t('chatBox.customise')}
                  </DropdownMenuItem>
                </>
              )}
            </ToolbarDropdown>
          )}

          <button
            type="button"
            onClick={onEditRepos}
            title={repoSummaryTitle}
            disabled={isDisabled}
            className={cn(
              'max-w-[320px] rounded-sm border border-border bg-secondary px-base py-half text-sm text-normal hover:bg-panel',
              'disabled:cursor-not-allowed disabled:opacity-50'
            )}
          >
            <span className="block truncate">{repoSummaryLabel}</span>
          </button>

          {saveAsDefault?.visible && (
            <label className="ml-half flex cursor-pointer items-center gap-1.5 text-sm text-low">
              <Checkbox
                checked={saveAsDefault.checked}
                onCheckedChange={saveAsDefault.onChange}
                className="h-3.5 w-3.5"
                disabled={isDisabled}
              />
              <span>{t('tasks:conversation.saveAsDefault')}</span>
            </label>
          )}

          {linkedIssue && (
            <div
              className="inline-flex items-center gap-1 h-6 px-2 bg-panel rounded-sm border text-sm text-normal font-medium whitespace-nowrap"
              title={linkedIssue.title}
            >
              <span className="text-low">#</span>
              <span className="font-mono text-xs">{linkedIssue.simpleId}</span>
              <button
                type="button"
                onClick={linkedIssue.onRemove}
                disabled={isDisabled}
                className="ml-1 text-low hover:text-error transition-colors disabled:opacity-50"
                aria-label={`Remove link to ${linkedIssue.simpleId}`}
              >
                <XIcon className="size-3" weight="bold" />
              </button>
            </div>
          )}
        </div>

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
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileInputChange}
      />
    </div>
  );
}
