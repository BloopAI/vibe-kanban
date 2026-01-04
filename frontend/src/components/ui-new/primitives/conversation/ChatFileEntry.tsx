import { CaretDownIcon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { getFileIcon } from '@/utils/fileTypeIcon';
import { useTheme } from '@/components/ThemeProvider';
import { getActualTheme } from '@/utils/theme';
import { ToolStatus } from 'shared/types';
import { ToolStatusDot } from './ToolStatusDot';
import { DiffViewBody, useDiffData, type DiffInput } from './DiffViewCard';

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
}: ChatFileEntryProps) {
  const { theme } = useTheme();
  const actualTheme = getActualTheme(theme);
  const hasStats = additions !== undefined || deletions !== undefined;
  const FileIcon = getFileIcon(filename, actualTheme);

  // Process diff content if provided
  const diffData = useDiffData(
    diffContent ?? { type: 'unified', path: filename, unifiedDiff: '' }
  );
  const hasDiffContent = diffContent && diffData.isValid;

  // If we have diff content, wrap in a container with the diff body
  if (hasDiffContent) {
    return (
      <div className={cn('rounded-sm border overflow-hidden', className)}>
        {/* Header */}
        <div
          className={cn(
            'flex items-center bg-panel p-base w-full',
            onToggle && 'cursor-pointer'
          )}
          onClick={onToggle}
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
          {onToggle && (
            <CaretDownIcon
              className={cn(
                'size-icon-xs shrink-0 text-low transition-transform',
                !expanded && '-rotate-90'
              )}
            />
          )}
        </div>

        {/* Diff body - shown when expanded */}
        {expanded && (
          <DiffViewBody
            diffFile={diffData.diffFile}
            diffData={diffData.diffData}
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
        'flex items-center bg-panel border rounded-sm p-base w-full',
        onToggle && 'cursor-pointer',
        className
      )}
      onClick={onToggle}
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
      {onToggle && (
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
