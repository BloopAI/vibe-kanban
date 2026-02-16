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

      <div className="rounded-sm border border-border bg-secondary px-plusfifty py-base">
        <div className="flex items-end gap-base">
          <div className="min-w-0 flex-1 py-half overflow-hidden">
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
            className="shrink-0 py-half"
          />
        </div>
      </div>

      <div className="flex items-start justify-between gap-base">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-0">
          <div className="inline-flex shrink-0 items-center gap-half">
            <DropdownMenu>
              <DropdownMenuTriggerButton
                disabled={isDisabled}
                className="h-auto border-0 bg-transparent px-0 py-0 hover:bg-transparent focus-visible:ring-0"
                aria-label={t('tasks:conversation.executors')}
              >
                <div className="flex min-w-0 items-center gap-half">
                  <AgentIcon
                    agent={agent}
                    className="size-icon-base shrink-0"
                  />
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
            <>
              <span
                className="mx-half h-3 w-px shrink-0 bg-border/70"
                aria-hidden="true"
              />
              <ToolbarDropdown
                label={variantLabel}
                disabled={isDisabled}
                className="h-auto shrink-0 border-0 bg-transparent px-0 py-0 hover:bg-transparent focus-visible:ring-0"
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
            </>
          )}

          {saveAsDefault?.visible && (
            <>
              <span
                className="mx-half h-3 w-px shrink-0 bg-border/70"
                aria-hidden="true"
              />
              <div className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm text-low px-base">
                <Checkbox
                  checked={saveAsDefault.checked}
                  onCheckedChange={saveAsDefault.onChange}
                  className="h-4 w-4"
                  disabled={isDisabled}
                />
                <button
                  type="button"
                  className="text-sm text-low hover:text-high disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => saveAsDefault.onChange(!saveAsDefault.checked)}
                  disabled={isDisabled}
                >
                  {t('tasks:conversation.saveAsDefault')}
                </button>
              </div>
            </>
          )}

          <span
            className="mx-half h-3 w-px shrink-0 bg-border/70"
            aria-hidden="true"
          />

          <button
            type="button"
            onClick={onEditRepos}
            title={repoSummaryTitle}
            disabled={isDisabled}
            className={cn(
              'max-w-[320px] shrink-0 bg-transparent px-base py-0 text-sm text-normal hover:text-high',
              'disabled:cursor-not-allowed disabled:opacity-50'
            )}
          >
            <span className="block truncate">{repoSummaryLabel}</span>
          </button>

          {linkedIssue && (
            <>
              <span
                className="mx-half h-3 w-px shrink-0 bg-border/70"
                aria-hidden="true"
              />
              <div
                className="inline-flex shrink-0 items-center gap-half whitespace-nowrap px-base text-sm text-low"
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
        </div>

        <div className="shrink-0">
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
