import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { CaretDownIcon } from '@phosphor-icons/react';
import { FileDiff, PatchDiff } from '@pierre/diffs/react';
import {
  parseDiffFromFile,
  type FileContents,
  type FileDiffMetadata,
  type ChangeContent,
} from '@pierre/diffs';
import { cn } from '@/lib/utils';
import { getFileIcon } from '@/utils/fileTypeIcon';
import { useTheme } from '@/components/ThemeProvider';
import { getActualTheme } from '@/utils/theme';
import { useDiffViewMode } from '@/stores/useDiffViewStore';
import { parseDiffStats } from '@/utils/diffStatsParser';
import { ToolStatus } from 'shared/types';
import { ToolStatusDot } from './ToolStatusDot';
import '@/styles/diff-style-overrides.css';

/**
 * CSS override for dark mode background.
 * The @pierre/diffs library sets --diffs-dark-bg via inline styles from the theme,
 * so we inject this CSS with !important to override it.
 */
const DARK_MODE_OVERRIDE_CSS = `
  [data-diffs] {
    --diffs-dark-bg: hsl(0, 0%, 20%) !important;
    --diffs-light-bg: hsl(0, 0%, 100%) !important;
  }
`;

// Discriminated union for input format flexibility
export type DiffInput =
  | {
      type: 'content';
      oldContent: string;
      newContent: string;
      oldPath?: string;
      newPath: string;
    }
  | {
      type: 'unified';
      path: string;
      unifiedDiff: string;
      hasLineNumbers?: boolean;
    };

interface DiffViewCardProps {
  input: DiffInput;
  expanded?: boolean;
  onToggle?: () => void;
  status?: ToolStatus;
  className?: string;
}

interface DiffData {
  fileDiffMetadata: FileDiffMetadata | null;
  unifiedDiff: string | null;
  additions: number;
  deletions: number;
  filePath: string;
  isValid: boolean;
  hideLineNumbers: boolean;
}

/**
 * Process input to get diff data and statistics
 */
export function useDiffData(input: DiffInput): DiffData {
  return useMemo(() => {
    if (input.type === 'content') {
      const filePath = input.newPath || input.oldPath || 'unknown';
      const oldContent = input.oldContent || '';
      const newContent = input.newContent || '';

      if (oldContent === newContent) {
        return {
          fileDiffMetadata: null,
          unifiedDiff: null,
          additions: 0,
          deletions: 0,
          filePath,
          isValid: false,
          hideLineNumbers: false,
        };
      }

      try {
        const oldFile: FileContents = {
          name: input.oldPath || filePath,
          contents: oldContent,
        };
        const newFile: FileContents = {
          name: filePath,
          contents: newContent,
        };
        const metadata = parseDiffFromFile(oldFile, newFile);

        // Calculate additions/deletions from hunks
        let additions = 0;
        let deletions = 0;
        for (const hunk of metadata.hunks) {
          for (const content of hunk.hunkContent) {
            if (content.type === 'change') {
              const change = content as ChangeContent;
              additions += change.additions.length;
              deletions += change.deletions.length;
            }
          }
        }

        return {
          fileDiffMetadata: metadata,
          unifiedDiff: null,
          additions,
          deletions,
          filePath,
          isValid: true,
          hideLineNumbers: false,
        };
      } catch (e) {
        console.error('Failed to generate diff:', e);
        return {
          fileDiffMetadata: null,
          unifiedDiff: null,
          additions: 0,
          deletions: 0,
          filePath,
          isValid: false,
          hideLineNumbers: false,
        };
      }
    } else {
      // Handle unified diff string
      const { path, unifiedDiff, hasLineNumbers = true } = input;
      const { additions, deletions } = parseDiffStats(unifiedDiff);
      const isValid = unifiedDiff.trim().length > 0;

      return {
        fileDiffMetadata: null,
        unifiedDiff,
        additions,
        deletions,
        filePath: path,
        isValid,
        hideLineNumbers: !hasLineNumbers,
      };
    }
  }, [input]);
}

export function DiffViewCard({
  input,
  expanded = false,
  onToggle,
  status,
  className,
}: DiffViewCardProps) {
  const { theme } = useTheme();
  const actualTheme = getActualTheme(theme);
  const {
    fileDiffMetadata,
    unifiedDiff,
    additions,
    deletions,
    filePath,
    isValid,
    hideLineNumbers,
  } = useDiffData(input);

  const FileIcon = getFileIcon(filePath, actualTheme);
  const hasStats = additions > 0 || deletions > 0;

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
          <span className="text-sm text-normal truncate font-ibm-plex-mono">
            {filePath}
          </span>
          {hasStats && (
            <span className="text-sm shrink-0">
              {additions > 0 && (
                <span className="text-success">+{additions}</span>
              )}
              {additions > 0 && deletions > 0 && ' '}
              {deletions > 0 && (
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
          fileDiffMetadata={fileDiffMetadata}
          unifiedDiff={unifiedDiff}
          isValid={isValid}
          hideLineNumbers={hideLineNumbers}
          theme={actualTheme}
        />
      )}
    </div>
  );
}

/**
 * Diff body component that renders the actual diff content
 */
export function DiffViewBody({
  fileDiffMetadata,
  unifiedDiff,
  isValid,
  hideLineNumbers,
  theme,
}: {
  fileDiffMetadata: FileDiffMetadata | null;
  unifiedDiff: string | null;
  isValid: boolean;
  hideLineNumbers?: boolean;
  theme: 'light' | 'dark';
}) {
  const { t } = useTranslation('tasks');
  const globalMode = useDiffViewMode();

  const options = useMemo(
    () => ({
      diffStyle:
        globalMode === 'split' ? ('split' as const) : ('unified' as const),
      diffIndicators: 'classic' as const,
      themeType: theme,
      overflow: 'scroll' as const,
      hunkSeparators: 'line-info' as const,
      disableFileHeader: true,
      unsafeCSS: DARK_MODE_OVERRIDE_CSS,
    }),
    [globalMode, theme]
  );

  if (!isValid) {
    return (
      <div className="px-base pb-base text-xs font-ibm-plex-mono text-low">
        {t('conversation.unableToRenderDiff')}
      </div>
    );
  }

  const wrapperClass = hideLineNumbers ? 'edit-diff-hide-nums' : '';

  // For content-based diff
  if (fileDiffMetadata) {
    return (
      <div className={wrapperClass}>
        <FileDiff fileDiff={fileDiffMetadata} options={options} />
      </div>
    );
  }

  // For unified diff string
  if (unifiedDiff) {
    return (
      <div className={wrapperClass}>
        <PatchDiff patch={unifiedDiff} options={options} />
      </div>
    );
  }

  return null;
}
