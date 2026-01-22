import { useMemo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CaretDownIcon,
  ChatCircleIcon,
  GithubLogoIcon,
  SpinnerGapIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react';
import {
  DiffView,
  DiffModeEnum,
  SplitSide,
  type DiffFile,
} from '@git-diff-view/react';
import { cn } from '@/lib/utils';
import { getFileIcon } from '@/utils/fileTypeIcon';
import { getHighLightLanguageFromPath } from '@/utils/extToLanguage';
import { useTheme } from '@/components/ThemeProvider';
import { getActualTheme } from '@/utils/theme';
import { useDiffViewMode } from '@/stores/useDiffViewStore';
import { stripLineEnding } from '@/utils/string';
import {
  useReview,
  type ReviewDraft,
  type ReviewComment,
} from '@/contexts/ReviewProvider';
import {
  useWorkspaceContext,
  type NormalizedGitHubComment,
} from '@/contexts/WorkspaceContext';
import { CommentWidgetLine } from './CommentWidgetLine';
import { ReviewCommentRenderer } from './ReviewCommentRenderer';
import { GitHubCommentRenderer } from './GitHubCommentRenderer';
import type { DiffChangeKind } from 'shared/types';
import { OpenInIdeButton } from '@/components/ide/OpenInIdeButton';
import { useOpenInEditor } from '@/hooks/useOpenInEditor';
import { useDiffWorker, getCachedDiffStats } from '@/hooks/useDiffWorker';
import '@/styles/diff-style-overrides.css';
import { DisplayTruncatedPath } from '@/utils/TruncatePath';
import {
  estimateDiffBodyHeightPx,
  estimateDiffLineCount,
} from '@/utils/diffHeightEstimate';

/** Discriminated union for comment data in extendData */
type ExtendLineData =
  | { type: 'review'; comment: ReviewComment }
  | { type: 'github'; comment: NormalizedGitHubComment };

// Discriminated union for input format flexibility
export type DiffInput =
  | {
      type: 'content';
      oldContent: string;
      newContent: string;
      oldPath: string | undefined;
      newPath: string;
      changeKind: DiffChangeKind;
      backendAdditions: number | null;
      backendDeletions: number | null;
    }
  | {
      type: 'unified';
      path: string;
      unifiedDiff: string;
      hasLineNumbers: boolean;
    };

/** Base props shared across all modes */
interface BaseProps {
  /** Diff data - either raw content or unified diff string */
  input: DiffInput;
  /** Additional className */
  className: string;
  /** Project ID for @ mentions in comments */
  projectId: string;
  /** Attempt ID for opening files in IDE */
  attemptId: string;
  /** Whether the diff list is currently scrolling */
  isScrolling: boolean;
}

/** Props for collapsible mode (with expand/collapse) */
interface CollapsibleProps extends BaseProps {
  mode: 'collapsible';
  /** Expansion state */
  expanded: boolean;
  /** Toggle expansion callback */
  onToggle: () => void;
}

/** Props for static mode (always expanded, no toggle) */
interface StaticProps extends BaseProps {
  mode: 'static';
}

type DiffViewCardWithCommentsProps = CollapsibleProps | StaticProps;

const HUGE_FILE_LINE_THRESHOLD = 1000;

interface DiffStats {
  additions: number;
  deletions: number;
  filePath: string;
}

interface DiffData extends DiffStats {
  diffFile: DiffFile | null;
  isValid: boolean;
  isLoading: boolean;
}

function readPlainLine(
  diffFile: DiffFile | null,
  lineNumber: number,
  side: SplitSide
): string | undefined {
  if (!diffFile) return undefined;
  try {
    const rawLine =
      side === SplitSide.old
        ? diffFile.getOldPlainLine(lineNumber)
        : diffFile.getNewPlainLine(lineNumber);
    if (rawLine?.value === undefined) return undefined;
    return stripLineEnding(rawLine.value);
  } catch (error) {
    console.error('Failed to read line content for review comment', error);
    return undefined;
  }
}

function useDiffStats(input: DiffInput, theme: 'light' | 'dark'): DiffStats {
  return useMemo(() => {
    if (input.type === 'content') {
      const filePath = input.newPath || input.oldPath || 'unknown';
      const oldContent = input.oldContent || '';
      const newContent = input.newContent || '';

      if (oldContent === newContent) {
        return { additions: 0, deletions: 0, filePath };
      }

      const oldLang =
        getHighLightLanguageFromPath(input.oldPath || filePath) || 'plaintext';
      const newLang =
        getHighLightLanguageFromPath(input.newPath || filePath) || 'plaintext';

      const cachedStats = getCachedDiffStats({
        oldFileName: input.oldPath || filePath,
        oldContent,
        newFileName: input.newPath || filePath,
        newContent,
        oldLang,
        newLang,
        theme,
      });

      if (cachedStats) {
        return { ...cachedStats, filePath };
      }

      const hasBackendStats =
        input.backendAdditions != null || input.backendDeletions != null;
      if (hasBackendStats) {
        return {
          additions: input.backendAdditions ?? 0,
          deletions: input.backendDeletions ?? 0,
          filePath,
        };
      }

      const oldLineCount = oldContent.split('\n').length;
      const newLineCount = newContent.split('\n').length;
      const lineDiff = newLineCount - oldLineCount;
      return {
        additions: lineDiff > 0 ? lineDiff : 0,
        deletions: lineDiff < 0 ? -lineDiff : 0,
        filePath,
      };
    } else {
      return { additions: 0, deletions: 0, filePath: input.path };
    }
  }, [input, theme]);
}

function useDiffData(
  input: DiffInput,
  expanded: boolean,
  theme: 'light' | 'dark'
): DiffData {
  const stats = useDiffStats(input, theme);

  const workerParams = useMemo(() => {
    if (input.type !== 'content') return null;
    const filePath = input.newPath || input.oldPath || 'unknown';
    const oldLang =
      getHighLightLanguageFromPath(input.oldPath || filePath) || 'plaintext';
    const newLang =
      getHighLightLanguageFromPath(input.newPath || filePath) || 'plaintext';

    return {
      oldFileName: input.oldPath || filePath,
      oldContent: input.oldContent || '',
      newFileName: input.newPath || filePath,
      newContent: input.newContent || '',
      oldLang,
      newLang,
      theme,
    };
  }, [input, theme]);

  const isContentEqual =
    input.type === 'content' && input.oldContent === input.newContent;

  const workerResult = useDiffWorker({
    oldFileName: workerParams?.oldFileName ?? '',
    oldContent: workerParams?.oldContent ?? '',
    newFileName: workerParams?.newFileName ?? '',
    newContent: workerParams?.newContent ?? '',
    oldLang: workerParams?.oldLang ?? '',
    newLang: workerParams?.newLang ?? '',
    theme: workerParams?.theme,
    enabled: expanded && input.type === 'content' && !isContentEqual,
  });

  if (!expanded) {
    return {
      ...stats,
      diffFile: null,
      isValid: false,
      isLoading: false,
    };
  }

  if (input.type === 'content') {
    if (isContentEqual) {
      return {
        ...stats,
        additions: 0,
        deletions: 0,
        diffFile: null,
        isValid: false,
        isLoading: false,
      };
    }

    const hasWorkerResult = !!workerResult.diffFile;
    return {
      filePath: stats.filePath,
      additions: hasWorkerResult ? workerResult.additions : stats.additions,
      deletions: hasWorkerResult ? workerResult.deletions : stats.deletions,
      diffFile: workerResult.diffFile,
      isValid: hasWorkerResult,
      isLoading: workerResult.isLoading,
    };
  }

  return {
    diffFile: null,
    additions: 0,
    deletions: 0,
    filePath: input.path,
    isValid: false,
    isLoading: false,
  };
}

export function DiffViewCardWithComments(props: DiffViewCardWithCommentsProps) {
  const { input, className, projectId, attemptId, mode, isScrolling } = props;
  const { t } = useTranslation('tasks');

  // Extract mode-specific values
  const expanded = mode === 'collapsible' ? props.expanded : true;
  const onToggle = mode === 'collapsible' ? props.onToggle : undefined;

  const { theme } = useTheme();
  const actualTheme = getActualTheme(theme);
  const globalMode = useDiffViewMode();
  const diffMode =
    globalMode === 'split' ? DiffModeEnum.Split : DiffModeEnum.Unified;

  const [hugeFileConfirmed, setHugeFileConfirmed] = useState(false);

  const backendLineCount =
    input.type === 'content'
      ? (input.backendAdditions ?? 0) + (input.backendDeletions ?? 0)
      : 0;
  const isHugeFile = backendLineCount > HUGE_FILE_LINE_THRESHOLD;
  const shouldBlockHugeFile = isHugeFile && !hugeFileConfirmed;

  const { diffFile, additions, deletions, filePath, isValid, isLoading } =
    useDiffData(input, expanded && !shouldBlockHugeFile, actualTheme);
  const estimatedLineCount = estimateDiffLineCount(additions, deletions);
  const estimatedBodyHeight = estimateDiffBodyHeightPx(estimatedLineCount);
  const { comments, drafts, setDraft, addComment } = useReview();
  const { showGitHubComments, getGitHubCommentsForFile } =
    useWorkspaceContext();

  // Open in IDE functionality
  const openInEditor = useOpenInEditor(attemptId);

  const handleOpenInIde = useCallback(() => {
    openInEditor({ filePath });
  }, [openInEditor, filePath]);

  const FileIcon = getFileIcon(filePath, actualTheme);
  const hasStats = additions > 0 || deletions > 0;

  // Extract change kind from input
  const changeKind = input.type === 'content' ? input.changeKind : undefined;
  const oldPath = input.type === 'content' ? input.oldPath : undefined;

  // Get short label for change kind (no label for modified)
  const getChangeLabel = (kind?: DiffChangeKind): string | null => {
    switch (kind) {
      case 'added':
        return 'Added';
      case 'deleted':
        return 'Deleted';
      case 'renamed':
        return 'Renamed';
      case 'copied':
        return 'Copied';
      case 'permissionChange':
        return 'Perm';
      default:
        return null;
    }
  };
  const changeLabel = getChangeLabel(changeKind);

  // Filter comments for this file
  const commentsForFile = useMemo(
    () => comments.filter((c) => c.filePath === filePath),
    [comments, filePath]
  );

  // Get GitHub comments for this file (only when enabled)
  const githubCommentsForFile = useMemo(() => {
    if (!showGitHubComments) return [];
    return getGitHubCommentsForFile(filePath);
  }, [showGitHubComments, getGitHubCommentsForFile, filePath]);

  // Total comment count (user + GitHub)
  const totalCommentCount =
    commentsForFile.length + githubCommentsForFile.length;
  const hasLineComments = totalCommentCount > 0;

  const hasDraftsForFile = useMemo(
    () => Object.keys(drafts).some((key) => key.startsWith(`${filePath}-`)),
    [drafts, filePath]
  );

  // Transform comments to git-diff-view extendData format
  // The library expects { data: T } where T is the actual data
  const extendData = useMemo(() => {
    if (!hasLineComments) return null;
    const oldFileData: Record<string, { data: ExtendLineData }> = {};
    const newFileData: Record<string, { data: ExtendLineData }> = {};

    // Add user review comments first (higher priority)
    commentsForFile.forEach((comment) => {
      const lineKey = String(comment.lineNumber);
      const entry: ExtendLineData = { type: 'review', comment };
      if (comment.side === SplitSide.old) {
        oldFileData[lineKey] = { data: entry };
      } else {
        newFileData[lineKey] = { data: entry };
      }
    });

    // Add GitHub comments (only if no user comment on that line).
    // User comments take priority - if you're adding your own comment on a line,
    // you've likely addressed the GitHub feedback, so we hide the GitHub comment.
    githubCommentsForFile.forEach((comment) => {
      const lineKey = String(comment.lineNumber);
      const entry: ExtendLineData = { type: 'github', comment };
      // Place comment on correct side based on GitHub's side field
      if (comment.side === SplitSide.old) {
        if (!oldFileData[lineKey]) {
          oldFileData[lineKey] = { data: entry };
        }
      } else {
        if (!newFileData[lineKey]) {
          newFileData[lineKey] = { data: entry };
        }
      }
    });

    return {
      oldFile: oldFileData,
      newFile: newFileData,
    };
  }, [commentsForFile, githubCommentsForFile, hasLineComments]);

  // Handle click on "add widget" button in diff view
  const handleAddWidgetClick = useCallback(
    (lineNumber: number, side: SplitSide) => {
      const widgetKey = `${filePath}-${side}-${lineNumber}`;
      const codeLine = readPlainLine(diffFile, lineNumber, side);
      const draft: ReviewDraft = {
        filePath,
        side,
        lineNumber,
        text: '',
        ...(codeLine !== undefined ? { codeLine } : {}),
      };
      setDraft(widgetKey, draft);
    },
    [filePath, diffFile, setDraft]
  );

  // Render the comment widget line (for new comments)
  const renderWidgetLine = useCallback(
    (props: { side: SplitSide; lineNumber: number; onClose: () => void }) => {
      const widgetKey = `${filePath}-${props.side}-${props.lineNumber}`;
      const draft = drafts[widgetKey];
      if (!draft) return null;

      return (
        <CommentWidgetLine
          draft={draft}
          widgetKey={widgetKey}
          onSave={props.onClose}
          onCancel={props.onClose}
          projectId={projectId}
        />
      );
    },
    [filePath, drafts, projectId]
  );

  // Render existing comments below lines (handles both user and GitHub comments)
  // The library wraps our data in { data: ExtendLineData }
  const renderExtendLine = useCallback(
    (lineData: { data: ExtendLineData }) => {
      // Guard against undefined data (can happen when switching diff modes)
      if (!lineData.data) return null;

      if (lineData.data.type === 'github') {
        const githubComment = lineData.data.comment;
        const handleCopyToUserComment = () => {
          addComment({
            filePath,
            lineNumber: githubComment.lineNumber,
            side: githubComment.side,
            text: githubComment.body,
          });
        };
        return (
          <GitHubCommentRenderer
            comment={githubComment}
            onCopyToUserComment={handleCopyToUserComment}
          />
        );
      }
      return (
        <ReviewCommentRenderer
          comment={lineData.data.comment}
          projectId={projectId}
        />
      );
    },
    [projectId, addComment, filePath]
  );

  return (
    <div className={cn('my-base rounded-sm border', className)}>
      {/* Header */}
      <div
        className={cn(
          'w-full flex items-center bg-primary px-base gap-base sticky top-0 z-10 border-b border-transparent ',
          onToggle && 'cursor-pointer',
          expanded && 'border-inherit rounded-t-sm'
        )}
        onClick={onToggle}
      >
        <span className="relative shrink-0">
          <FileIcon className="size-icon-base" />
        </span>
        {changeLabel && (
          <span
            className={cn(
              'text-sm shrink-0 bg-primary rounded-sm px-1',
              changeKind === 'deleted' && 'text-error border border-error/20',
              changeKind === 'added' && 'text-success border border-success/20'
            )}
          >
            {changeLabel}
          </span>
        )}
        <div
          className={cn(
            'text-sm flex-1 min-w-0',
            changeKind === 'deleted' && 'text-error line-through'
          )}
        >
          <DisplayTruncatedPath path={filePath} />
        </div>
        {(changeKind === 'renamed' || changeKind === 'copied') && oldPath && (
          <span className="text-low text-sm shrink-0">
            ← {oldPath.split('/').pop()}
          </span>
        )}
        {hasStats && (
          <span className="text-sm shrink-0">
            {additions > 0 && (
              <span className="text-success">+{additions}</span>
            )}
            {additions > 0 && deletions > 0 && ' '}
            {deletions > 0 && <span className="text-error">-{deletions}</span>}
          </span>
        )}
        {totalCommentCount > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded shrink-0">
            {commentsForFile.length > 0 && (
              <span className="inline-flex items-center gap-0.5 text-accent">
                <ChatCircleIcon className="size-icon-xs" weight="fill" />
                {commentsForFile.length}
              </span>
            )}
            {githubCommentsForFile.length > 0 && (
              <span className="inline-flex items-center gap-0.5 text-low">
                <GithubLogoIcon className="size-icon-xs" weight="fill" />
                {githubCommentsForFile.length}
              </span>
            )}
          </span>
        )}
        <div className="flex items-center gap-1 shrink-0">
          <span onClick={(e) => e.stopPropagation()}>
            <OpenInIdeButton
              onClick={handleOpenInIde}
              className="size-icon-xs p-0"
            />
          </span>
          {onToggle && (
            <CaretDownIcon
              className={cn(
                'size-icon-xs text-low transition-transform',
                !expanded && '-rotate-90'
              )}
            />
          )}
        </div>
      </div>

      {/* Diff body - shown when expanded */}
      {expanded && shouldBlockHugeFile && (
        <div className="px-base py-4 flex flex-col items-center gap-3 text-center">
          <WarningCircleIcon className="size-icon-lg text-warning" />
          <div className="text-sm text-low">
            {t('conversation.hugeFileDiffWarning', {
              lines: backendLineCount.toLocaleString(),
            })}
          </div>
          <button
            type="button"
            onClick={() => setHugeFileConfirmed(true)}
            className="px-3 py-1.5 text-sm bg-panel border rounded-sm hover:bg-muted transition-colors"
          >
            {t('conversation.showDiffAnyway')}
          </button>
        </div>
      )}
      {expanded && !shouldBlockHugeFile && (
        <DiffViewBodyWithComments
          diffFile={diffFile}
          isValid={isValid}
          isLoading={isLoading}
          estimatedBodyHeight={estimatedBodyHeight}
          theme={actualTheme}
          diffMode={diffMode}
          isScrolling={isScrolling}
          extendData={hasLineComments ? (extendData ?? undefined) : undefined}
          onAddWidgetClick={handleAddWidgetClick}
          renderWidgetLine={
            !isScrolling || hasDraftsForFile ? renderWidgetLine : undefined
          }
          renderExtendLine={hasLineComments ? renderExtendLine : undefined}
        />
      )}
    </div>
  );
}

function DiffViewBodyWithComments({
  diffFile,
  isValid,
  isLoading,
  estimatedBodyHeight,
  theme,
  diffMode,
  isScrolling,
  extendData,
  onAddWidgetClick,
  renderWidgetLine,
  renderExtendLine,
}: {
  diffFile: DiffFile | null;
  isValid: boolean;
  isLoading: boolean;
  estimatedBodyHeight: number;
  theme: 'light' | 'dark';
  diffMode: DiffModeEnum;
  isScrolling: boolean;
  extendData:
    | {
        oldFile: Record<string, { data: ExtendLineData }>;
        newFile: Record<string, { data: ExtendLineData }>;
      }
    | null
    | undefined;
  onAddWidgetClick: (lineNumber: number, side: SplitSide) => void;
  renderWidgetLine:
    | ((props: {
        side: SplitSide;
        lineNumber: number;
        onClose: () => void;
      }) => React.ReactNode)
    | undefined;
  renderExtendLine:
    | ((lineData: { data: ExtendLineData }) => React.ReactNode)
    | undefined;
}) {
  const { t } = useTranslation('tasks');

  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center py-8 text-low"
        style={{ minHeight: estimatedBodyHeight }}
      >
        <SpinnerGapIcon className="size-icon-base animate-spin" />
      </div>
    );
  }

  if (!isValid || !diffFile) {
    return (
      <div className="px-base pb-base text-xs font-ibm-plex-mono text-low">
        {t('conversation.unableToRenderDiff')}
      </div>
    );
  }

  return (
    <div>
      <DiffView
        diffFile={diffFile}
        diffViewWrap={false}
        diffViewTheme={theme}
        diffViewHighlight={!isScrolling}
        diffViewMode={diffMode}
        diffViewFontSize={12}
        diffViewAddWidget={!isScrolling}
        onAddWidgetClick={onAddWidgetClick}
        renderWidgetLine={renderWidgetLine}
        extendData={extendData ?? undefined}
        renderExtendLine={renderExtendLine}
      />
    </div>
  );
}
