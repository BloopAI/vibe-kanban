import { type ReactNode } from 'react';
import { ImageIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import WYSIWYGEditor from '@/components/ui/wysiwyg';
import type { LocalImageMetadata } from '@/components/ui/wysiwyg/context/task-attempt-context';
import { useUserSystem } from '@/components/ConfigProvider';
import type { BaseCodingAgent, ExecutorConfig } from 'shared/types';
import { Toolbar } from './Toolbar';
import { ModelSelectorContainer } from '../containers/ModelSelectorContainer';

export interface EditorProps {
  value: string;
  onChange: (value: string) => void;
}

export enum VisualVariant {
  NORMAL = 'NORMAL',
  FEEDBACK = 'FEEDBACK',
  EDIT = 'EDIT',
  PLAN = 'PLAN',
}

export interface DropzoneProps {
  getRootProps: () => Record<string, unknown>;
  getInputProps: () => Record<string, unknown>;
  isDragActive: boolean;
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

export interface ChatBoxModelSelector extends ModelSelectorProps {
  agent: BaseCodingAgent;
  workspaceId?: string;
}

interface ChatBoxBaseProps {
  // Editor
  editor: EditorProps;
  placeholder: string;
  onCmdEnter: () => void;
  disabled?: boolean;
  repoIds?: string[];
  repoId?: string;
  executor?: BaseCodingAgent | null;
  autoFocus?: boolean;

  // Error display
  error?: string | null;

  // Header content (right side - session/executor dropdown)
  headerRight?: ReactNode;

  // Header content (left side - stats)
  headerLeft?: ReactNode;

  // Footer left content (additional toolbar items like attach button)
  footerLeft?: ReactNode;

  // Footer right content (action buttons)
  footerRight: ReactNode;

  // Model selector (rendered with footer controls)
  modelSelector?: ChatBoxModelSelector;

  // Banner content (queued message indicator, feedback mode indicator)
  banner?: ReactNode;

  // visualVariant
  visualVariant: VisualVariant;

  // File paste handler for attachments
  onPasteFiles?: (files: File[]) => void;

  // Whether the workspace is running (shows animated border)
  isRunning?: boolean;

  // Key to force editor remount (e.g., when entering feedback mode to trigger auto-focus)
  focusKey?: string;

  // Local images for immediate preview (before saved to server)
  localImages?: LocalImageMetadata[];

  // Dropzone props for drag-and-drop image uploads
  dropzone?: DropzoneProps;
}

/**
 * Base chat box layout component.
 * Provides shared structure for CreateChatBox and SessionChatBox.
 */
export function ChatBoxBase({
  editor,
  placeholder,
  onCmdEnter,
  disabled,
  repoIds,
  repoId,
  executor,
  autoFocus,
  error,
  headerRight,
  headerLeft,
  footerLeft,
  footerRight,
  modelSelector,
  banner,
  visualVariant,
  onPasteFiles,
  isRunning,
  focusKey,
  localImages,
  dropzone,
}: ChatBoxBaseProps) {
  const { t } = useTranslation(['common', 'tasks']);
  const { config } = useUserSystem();

  const isDragActive = dropzone?.isDragActive ?? false;
  const activeModelSelector = modelSelector ?? null;

  return (
    <div
      {...(dropzone?.getRootProps() ?? {})}
      className={cn(
        'relative flex w-chat max-w-full flex-col rounded-sm border border-border bg-secondary',
        (visualVariant === VisualVariant.FEEDBACK ||
          visualVariant === VisualVariant.EDIT ||
          visualVariant === VisualVariant.PLAN) &&
          'border-brand bg-brand/10',
        isRunning && 'chat-box-running'
      )}
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
      {/* Error alert */}
      {error && (
        <div className="bg-error/10 border-b px-double py-base">
          <p className="text-error text-sm">{error}</p>
        </div>
      )}

      {/* Banner content (queued indicator, feedback mode, etc.) */}
      {banner}

      {/* Header - Stats and selector */}
      {visualVariant === VisualVariant.NORMAL && (
        <div className="flex items-center gap-base border-b px-base py-base">
          <div className="flex flex-1 items-center gap-base text-sm min-w-0 overflow-hidden">
            {headerLeft}
          </div>
          <Toolbar className="gap-[9px]">{headerRight}</Toolbar>
        </div>
      )}

      {/* Editor area */}
      <div className="flex flex-col gap-plusfifty px-base py-base rounded-md">
        <WYSIWYGEditor
          key={focusKey}
          placeholder={placeholder}
          value={editor.value}
          onChange={editor.onChange}
          onCmdEnter={onCmdEnter}
          disabled={disabled}
          // min-h-double ensures space for at least one line of text,
          // preventing the absolutely-positioned placeholder from overlapping
          // with the footer when the editor is empty
          className="min-h-double max-h-[50vh] overflow-y-auto"
          repoIds={repoIds}
          repoId={repoId}
          executor={executor ?? null}
          autoFocus={autoFocus}
          onPasteFiles={onPasteFiles}
          localImages={localImages}
          sendShortcut={config?.send_message_shortcut}
        />

        {/* Footer - Controls */}
        <div className="flex items-end justify-between gap-base">
          <Toolbar className="flex-1 min-w-0 flex-wrap !gap-half">
            {activeModelSelector && (
              <ModelSelectorContainer
                agent={activeModelSelector.agent}
                workspaceId={activeModelSelector.workspaceId}
                onAdvancedSettings={activeModelSelector.onAdvancedSettings}
                presets={activeModelSelector.presets}
                selectedPreset={activeModelSelector.selectedPreset}
                onPresetSelect={activeModelSelector.onPresetSelect}
                onOverrideChange={activeModelSelector.onOverrideChange}
                executorConfig={activeModelSelector.executorConfig}
                presetOptions={activeModelSelector.presetOptions}
              />
            )}
            {footerLeft}
          </Toolbar>
          <div className="flex shrink-0 gap-base">{footerRight}</div>
        </div>
      </div>
    </div>
  );
}
