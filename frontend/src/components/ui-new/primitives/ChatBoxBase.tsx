import { type ReactNode } from 'react';
import { CheckIcon, GearIcon, ImageIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { toPrettyCase } from '@/utils/string';
import WYSIWYGEditor from '@/components/ui/wysiwyg';
import type { LocalImageMetadata } from '@/components/ui/wysiwyg/context/task-attempt-context';
import { Toolbar, ToolbarDropdown } from './Toolbar';
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from './Dropdown';

export interface EditorProps {
  value: string;
  onChange: (value: string) => void;
}

export interface VariantProps {
  selected: string | null;
  options: string[];
  onChange: (variant: string | null) => void;
  onCustomise?: () => void;
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

interface ChatBoxBaseProps {
  // Editor
  editor: EditorProps;
  placeholder: string;
  onCmdEnter: () => void;
  disabled?: boolean;
  workspaceId?: string;
  projectId?: string;
  autoFocus?: boolean;

  // Variant selection
  variant?: VariantProps;

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
  workspaceId,
  projectId,
  autoFocus,
  variant,
  error,
  headerRight,
  headerLeft,
  footerLeft,
  footerRight,
  banner,
  visualVariant,
  onPasteFiles,
  isRunning,
  focusKey,
  localImages,
  dropzone,
}: ChatBoxBaseProps) {
  const { t } = useTranslation(['common', 'tasks']);
  const variantLabel = toPrettyCase(variant?.selected || 'DEFAULT');
  const variantOptions = variant?.options ?? [];

  const isDragActive = dropzone?.isDragActive ?? false;

  return (
    <div
      {...(dropzone?.getRootProps() ?? {})}
      className={cn(
        'flex w-chat max-w-full flex-col relative',
        '@chat:rounded-t-md',
        !isDragActive && 'border-t @chat:border-x',
        (visualVariant === VisualVariant.FEEDBACK ||
          visualVariant === VisualVariant.EDIT ||
          visualVariant === VisualVariant.PLAN) &&
          'border-brand bg-brand/10',
        isRunning && 'chat-box-running'
      )}
    >
      {dropzone && <input {...dropzone.getInputProps()} />}

      {isDragActive && (
        <div className="absolute inset-0 z-50 bg-primary/80 backdrop-blur-sm border-2 border-dashed border-brand @chat:rounded-t-md flex items-center justify-center pointer-events-none animate-in fade-in-0 duration-150">
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
        <div className="flex items-center gap-base bg-secondary px-base py-[9px] @chat:rounded-t-md border-b">
          <div className="flex flex-1 items-center gap-base text-sm">
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
          className="min-h-0 max-h-[50vh] overflow-y-auto"
          workspaceId={workspaceId}
          projectId={projectId}
          autoFocus={autoFocus}
          onPasteFiles={onPasteFiles}
          localImages={localImages}
        />

        {/* Footer - Controls */}
        <div className="flex items-end justify-between">
          <Toolbar className="flex-1 gap-double">
            {(visualVariant === VisualVariant.NORMAL ||
              visualVariant === VisualVariant.EDIT) &&
              variant &&
              variantOptions.length > 0 && (
                <ToolbarDropdown label={variantLabel} disabled={disabled}>
                  <DropdownMenuLabel>{t('chatBox.variants')}</DropdownMenuLabel>
                  {variantOptions.map((variantName) => (
                    <DropdownMenuItem
                      key={variantName}
                      icon={
                        variant?.selected === variantName
                          ? CheckIcon
                          : undefined
                      }
                      onClick={() => variant?.onChange(variantName)}
                    >
                      {toPrettyCase(variantName)}
                    </DropdownMenuItem>
                  ))}
                  {variant?.onCustomise && (
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
            {footerLeft}
          </Toolbar>
          <div className="flex gap-base">{footerRight}</div>
        </div>
      </div>
    </div>
  );
}
