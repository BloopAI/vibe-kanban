import { useTranslation } from 'react-i18next';
import { CaretDownIcon, ArrowSquareUpRightIcon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { getFileIcon } from '@/utils/fileTypeIcon';
import { useTheme } from '@/components/ThemeProvider';
import { getActualTheme } from '@/utils/theme';
import { ToolStatus } from 'shared/types';
import { inIframe, openFileInVSCode } from '@/vscode/bridge';
import { ToolStatusDot } from './ToolStatusDot';
import {
  DiffViewBody,
  useDiffData,
  type DiffInput,
} from './PierreConversationDiff';

interface ChatFileEntryProps {
  filename: string;
  additions?: number;
  deletions?: number;
  expanded?: boolean;
  onToggle?: () => void;
  className?: string;
  status?: ToolStatus;
  /** Optional diff content for expanded view */
  diffContent?: DiffInput;
  /** Optional callback to open file in changes panel */
  onOpenInChanges?: () => void;
}

export function ChatFileEntry({
  filename,
  additions,
  deletions,
  expanded = false,
  onToggle,
  className,
  status,
  diffContent,
  onOpenInChanges,
}: ChatFileEntryProps) {
  const { t } = useTranslation('tasks');
  const { theme } = useTheme();
  const actualTheme = getActualTheme(theme);
  const hasStats = additions !== undefined || deletions !== undefined;
  const FileIcon = getFileIcon(filename, actualTheme);
  const isDenied = status?.status === 'denied';
  const isVSCode = inIframe();

  const handleClick = () => {
    if (isVSCode) {
      openFileInVSCode(filename, { openAsDiff: false });
    } else {
      onToggle?.();
    }
  };

  // Process diff content if provided
  const diffData = useDiffData(
    diffContent ?? { type: 'unified', path: filename, unifiedDiff: '' }
  );
  const hasDiffContent = diffContent && diffData.isValid;

  // If we have diff content, wrap in a container with the diff body
  if (hasDiffContent) {
    return (
      <div
        className={cn(
          'rounded-sm border overflow-hidden',
          isDenied && 'border-error bg-error/10',
          className
        )}
      >
        {/* Header */}
        <div
          className={cn(
            'flex items-center p-base w-full',
            isDenied ? 'bg-error/20' : 'bg-panel',
            (onToggle || isVSCode) && 'cursor-pointer'
          )}
          onClick={handleClick}
        >
          <div className="flex-1 flex items-center gap-base min-w-0">
            <span className="relative shrink-0">
              <FileIcon className="size-icon-base" />
              {status && (
                <ToolStatusDot
                  status={status}
                  className="absolute -bottom-0.5 -right-0.5"
                />
              )}
            </span>
            <span className="text-sm text-normal truncate">{filename}</span>
            {onOpenInChanges && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenInChanges();
                }}
                className="shrink-0 p-0.5 rounded hover:bg-muted text-low hover:text-normal transition-colors"
                title={t('conversation.viewInChangesPanel')}
              >
                <ArrowSquareUpRightIcon className="size-icon-xs" />
              </button>
            )}
            {hasStats && (
              <span className="text-sm shrink-0">
                {additions !== undefined && additions > 0 && (
                  <span className="text-success">+{additions}</span>
                )}
                {additions !== undefined && deletions !== undefined && ' '}
                {deletions !== undefined && deletions > 0 && (
                  <span className="text-error">-{deletions}</span>
                )}
              </span>
            )}
          </div>
          {!isVSCode && onToggle && (
            <CaretDownIcon
              className={cn(
                'size-icon-xs shrink-0 text-low transition-transform',
                !expanded && '-rotate-90'
              )}
            />
          )}
        </div>

        {/* Diff body - shown when expanded */}
        {!isVSCode && expanded && (
          <DiffViewBody
            fileDiffMetadata={diffData.fileDiffMetadata}
            unifiedDiff={diffData.unifiedDiff}
            isValid={diffData.isValid}
            hideLineNumbers={diffData.hideLineNumbers}
            theme={actualTheme}
          />
        )}
      </div>
    );
  }

  // Original header-only rendering (no diff content)
  return (
    <div
      className={cn(
        'flex items-center border rounded-sm p-base w-full',
        isDenied ? 'bg-error/20 border-error' : 'bg-panel',
        (onToggle || isVSCode) && 'cursor-pointer',
        className
      )}
      onClick={handleClick}
    >
      <div className="flex-1 flex items-center gap-base min-w-0">
        <span className="relative shrink-0">
          <FileIcon className="size-icon-base" />
          {status && (
            <ToolStatusDot
              status={status}
              className="absolute -bottom-0.5 -right-0.5"
            />
          )}
        </span>
        <span className="text-sm text-normal truncate">{filename}</span>
        {onOpenInChanges && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenInChanges();
            }}
            className="shrink-0 p-0.5 rounded hover:bg-muted text-low hover:text-normal transition-colors"
            title={t('conversation.viewInChangesPanel')}
          >
            <ArrowSquareUpRightIcon className="size-icon-xs" />
          </button>
        )}
        {hasStats && (
          <span className="text-sm shrink-0">
            {additions !== undefined && additions > 0 && (
              <span className="text-success">+{additions}</span>
            )}
            {additions !== undefined && deletions !== undefined && ' '}
            {deletions !== undefined && deletions > 0 && (
              <span className="text-error">-{deletions}</span>
            )}
          </span>
        )}
      </div>
      {!isVSCode && onToggle && (
        <CaretDownIcon
          className={cn(
            'size-icon-xs shrink-0 text-low transition-transform',
            !expanded && '-rotate-90'
          )}
        />
      )}
    </div>
  );
}
