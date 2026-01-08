import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { CaretDownIcon } from '@phosphor-icons/react';
import {
  DiffView,
  DiffModeEnum,
  DiffLineType,
  parseInstance,
} from '@git-diff-view/react';
import { generateDiffFile, type DiffFile } from '@git-diff-view/file';
import { cn } from '@/lib/utils';
import { getFileIcon } from '@/utils/fileTypeIcon';
import { getHighLightLanguageFromPath } from '@/utils/extToLanguage';
import { useTheme } from '@/components/ThemeProvider';
import { getActualTheme } from '@/utils/theme';
import { useDiffViewMode } from '@/stores/useDiffViewStore';
import { ToolStatus } from 'shared/types';
import { ToolStatusDot } from './ToolStatusDot';
import '@/styles/diff-style-overrides.css';

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
  /** Diff data - either raw content or unified diff string */
  input: DiffInput;
  /** Expansion state */
  expanded?: boolean;
  /** Toggle expansion callback */
  onToggle?: () => void;
  /** Optional status indicator */
  status?: ToolStatus;
  /** Additional className */
  className?: string;
}

interface DiffData {
  diffFile: DiffFile | null;
  diffData: {
    hunks: string[];
    oldFile: { fileName: string; fileLang: string };
    newFile: { fileName: string; fileLang: string };
  } | null;
  additions: number;
  deletions: number;
  filePath: string;
  isValid: boolean;
  hideLineNumbers: boolean;
}

/**
 * Process input to get diff data and statistics
 */
function useDiffData(input: DiffInput): DiffData {
  return useMemo(() => {
    if (input.type === 'content') {
      // Handle Diff object with oldContent/newContent
      const filePath = input.newPath || input.oldPath || 'unknown';
      const oldLang =
        getHighLightLanguageFromPath(input.oldPath || filePath) || 'plaintext';
      const newLang =
        getHighLightLanguageFromPath(input.newPath || filePath) || 'plaintext';

      const oldContent = input.oldContent || '';
      const newContent = input.newContent || '';

      if (oldContent === newContent) {
        return {
          diffFile: null,
          diffData: null,
          additions: 0,
          deletions: 0,
          filePath,
          isValid: false,
          hideLineNumbers: false,
        };
      }

      try {
        const file = generateDiffFile(
          input.oldPath || filePath,
          oldContent,
          input.newPath || filePath,
          newContent,
          oldLang,
          newLang
        );
        file.initRaw();

        return {
          diffFile: file,
          diffData: null,
          additions: file.additionLength ?? 0,
          deletions: file.deletionLength ?? 0,
          filePath,
          isValid: true,
          hideLineNumbers: false,
        };
      } catch (e) {
        console.error('Failed to generate diff:', e);
        return {
          diffFile: null,
          diffData: null,
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
      const lang = getHighLightLanguageFromPath(path) || 'plaintext';

      let additions = 0;
      let deletions = 0;
      let isValid = false;

      try {
        const parsed = parseInstance.parse(unifiedDiff);
        for (const hunk of parsed.hunks) {
          for (const line of hunk.lines) {
            if (line.type === DiffLineType.Add) additions++;
            else if (line.type === DiffLineType.Delete) deletions++;
          }
        }
        isValid = parsed.hunks.length > 0;
      } catch (e) {
        console.error('Failed to parse unified diff:', e);
      }

      return {
        diffFile: null,
        diffData: {
          hunks: [unifiedDiff],
          oldFile: { fileName: path, fileLang: lang },
          newFile: { fileName: path, fileLang: lang },
        },
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
    diffFile,
    diffData,
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
          diffFile={diffFile}
          diffData={diffData}
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
 * Can be used standalone (e.g., inside ChatFileEntry when expanded)
 */
export function DiffViewBody({
  diffFile,
  diffData,
  isValid,
  hideLineNumbers,
  theme,
}: {
  diffFile: DiffFile | null;
  diffData: {
    hunks: string[];
    oldFile: { fileName: string; fileLang: string };
    newFile: { fileName: string; fileLang: string };
  } | null;
  isValid: boolean;
  hideLineNumbers?: boolean;
  theme: 'light' | 'dark';
}) {
  const { t } = useTranslation('tasks');
  const globalMode = useDiffViewMode();
  const diffMode =
    globalMode === 'split' ? DiffModeEnum.Split : DiffModeEnum.Unified;

  if (!isValid) {
    return (
      <div className="px-base pb-base text-xs font-ibm-plex-mono text-low">
        {t('conversation.unableToRenderDiff')}
      </div>
    );
  }

  const wrapperClass = hideLineNumbers ? 'edit-diff-hide-nums' : '';

  // For content-based diff (Diff object)
  if (diffFile) {
    return (
      <div className={wrapperClass}>
        <DiffView
          diffFile={diffFile}
          diffViewWrap={false}
          diffViewTheme={theme}
          diffViewHighlight
          diffViewMode={diffMode}
          diffViewFontSize={12}
        />
      </div>
    );
  }

  // For unified diff string
  if (diffData) {
    return (
      <div className={wrapperClass}>
        <DiffView
          data={diffData}
          diffViewWrap={false}
          diffViewTheme={theme}
          diffViewHighlight
          diffViewMode={diffMode}
          diffViewFontSize={12}
        />
      </div>
    );
  }

  return null;
}

/**
 * Hook to process diff input - exported for use in ChatFileEntry
 */
export { useDiffData };
