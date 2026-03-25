import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PlusIcon } from '@phosphor-icons/react';
import { FileDiff } from '@pierre/diffs/react';
import type {
  DiffLineAnnotation,
  AnnotationSide,
  ChangeContent,
} from '@pierre/diffs';
import { DiffSide } from '@/shared/types/diff';
import {
  transformDiffToFileDiffMetadata,
  transformCommentsToAnnotations,
  type CommentAnnotation,
} from '@/shared/lib/diffDataAdapter';
import { useTheme } from '@/shared/hooks/useTheme';
import { getActualTheme } from '@/shared/lib/theme';
import {
  useDiffViewMode,
  useWrapTextDiff,
  useIgnoreWhitespaceDiff,
} from '@/shared/stores/useDiffViewStore';
import { useReview, type ReviewDraft } from '@/shared/hooks/useReview';
import {
  useShowGitHubComments,
  useGetGitHubCommentsForFile,
} from '@/shared/stores/useWorkspaceDiffStore';
import { stripLineEnding, splitLines } from '@/shared/lib/string';
import { ReviewCommentRenderer } from './ReviewCommentRenderer';
import { GitHubCommentRenderer } from './GitHubCommentRenderer';
import { CommentWidgetLine } from './CommentWidgetLine';
import {
  getRawDiffLineCount,
  shouldUseLargeDiffPlaceholder,
} from '@/shared/lib/diffRenderMode';
import type { Diff } from 'shared/types';

type ExtendedCommentAnnotation =
  | CommentAnnotation
  | { type: 'draft'; draft: ReviewDraft; widgetKey: string };

function mapSideToAnnotationSide(side: DiffSide): AnnotationSide {
  return side === DiffSide.Old ? 'deletions' : 'additions';
}

function mapAnnotationSideToSplitSide(side: AnnotationSide): DiffSide {
  return side === 'deletions' ? DiffSide.Old : DiffSide.New;
}

function getLineContent(
  content: string | null,
  lineNumber: number
): string | undefined {
  if (!content) return undefined;
  const lines = splitLines(content);
  const index = lineNumber - 1;
  if (index < 0 || index >= lines.length) return undefined;
  return stripLineEnding(lines[index]);
}

function getCodeLineForComment(
  diff: Diff,
  lineNumber: number,
  side: DiffSide
): string | undefined {
  const content = side === DiffSide.Old ? diff.oldContent : diff.newContent;
  return getLineContent(content, lineNumber);
}

const NOOP = () => {};

// Injected into @pierre/diffs via unsafeCSS — applies at @layer unsafe (highest priority)
const PIERRE_DIFFS_THEME_CSS = `
  [data-separator="line-info"][data-separator-first] {
    margin-top: 4px;
  }
  [data-separator="line-info"][data-separator-last] {
    margin-bottom: 4px;
  }

  [data-indicators='classic'] [data-column-content] {
    position: relative !important;
    padding-inline-start: 34px !important;
  }

  [data-indicators='classic'] [data-line-type='change-addition'] [data-column-content]::before,
  [data-indicators='classic'] [data-line-type='change-deletion'] [data-column-content]::before {
    left: 22px !important;
  }

  [data-hover-slot] {
    right: auto !important;
    left: calc(var(--diffs-column-number-width, 3ch) - 25px) !important;
    width: 22px !important;
  }

  [data-annotation-content] {
    grid-column: 1 / -1 !important;
    left: 0 !important;
    width: var(--diffs-column-width, 100%) !important;
    max-width: 100% !important;
  }
  
  [data-line-annotation] {
    grid-column: 1 / -1 !important;
  }

  [data-code] {
    padding-bottom: 0 !important;
  }
  [data-code]::-webkit-scrollbar {
    height: 8px !important;
    background: transparent !important;
  }
  [data-code]::-webkit-scrollbar-track {
    background: transparent !important;
  }
  [data-code]::-webkit-scrollbar-thumb {
    background-color: transparent !important;
    border-radius: 4px !important;
  }
  [data-code]:hover::-webkit-scrollbar-thumb {
    background-color: hsl(var(--text-low) / 0.3) !important;
  }

  [data-diff][data-theme-type='light'] {
    --diffs-gap-style: none !important;
    --diffs-light-bg: hsl(var(--bg-primary)) !important;
    --diffs-bg-context-override: hsl(var(--bg-primary)) !important;
    --diffs-bg-separator-override: hsl(var(--bg-primary)) !important;
    --diffs-light-addition-color: hsl(160, 77%, 35%) !important;
    --diffs-bg-addition-override: hsl(160, 77%, 88%) !important;
    --diffs-bg-addition-number-override: hsl(160, 77%, 85%) !important;
    --diffs-bg-addition-hover-override: hsl(160, 77%, 82%) !important;
    --diffs-light-deletion-color: hsl(10, 100%, 40%) !important;
    --diffs-bg-deletion-override: hsl(10, 100%, 90%) !important;
    --diffs-bg-deletion-number-override: hsl(10, 100%, 87%) !important;
    --diffs-bg-deletion-hover-override: hsl(10, 100%, 84%) !important;
    --diffs-fg-number-override: hsl(var(--text-low)) !important;
  }

  [data-diff][data-theme-type='dark'] {
    --diffs-gap-style: none !important;
    --diffs-dark-bg: hsl(var(--bg-panel)) !important;
    --diffs-bg-context-override: hsl(var(--bg-panel)) !important;
    --diffs-bg-separator-override: hsl(var(--bg-panel)) !important;
    --diffs-bg-hover-override: hsl(0, 0%, 22%) !important;
    --diffs-dark-addition-color: hsl(130, 50%, 50%) !important;
    --diffs-bg-addition-override: hsl(130, 30%, 20%) !important;
    --diffs-bg-addition-number-override: hsl(130, 30%, 18%) !important;
    --diffs-bg-addition-hover-override: hsl(130, 30%, 25%) !important;
    --diffs-dark-deletion-color: hsl(12, 50%, 55%) !important;
    --diffs-bg-deletion-override: hsl(12, 30%, 18%) !important;
    --diffs-bg-deletion-number-override: hsl(12, 30%, 16%) !important;
    --diffs-bg-deletion-hover-override: hsl(12, 30%, 23%) !important;
    --diffs-fg-number-override: hsl(var(--text-low)) !important;
  }
`;

export interface DiffCardExpandedBodyProps {
  diff: Diff;
  filePath: string;
  additions: number;
  deletions: number;
  onReadyChange?: (ready: boolean) => void;
}

export function DiffCardExpandedBody({
  diff,
  filePath,
  additions,
  deletions,
  onReadyChange,
}: DiffCardExpandedBodyProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation('tasks');
  const { theme } = useTheme();
  const actualTheme = getActualTheme(theme);
  const globalMode = useDiffViewMode();
  const wrapText = useWrapTextDiff();
  const ignoreWhitespace = useIgnoreWhitespaceDiff();
  const { comments, drafts, setDraft, addComment } = useReview();
  const showGitHubComments = useShowGitHubComments();
  const getGitHubCommentsForFile = useGetGitHubCommentsForFile();
  const [forceExpanded, setForceExpanded] = useState(false);
  const rawTotalLines = getRawDiffLineCount(diff);
  const shouldShowPlaceholder = shouldUseLargeDiffPlaceholder(
    diff,
    forceExpanded
  );

  const commentsForFile = comments.filter((c) => c.filePath === filePath);
  const githubCommentsForFile = showGitHubComments
    ? getGitHubCommentsForFile(filePath)
    : [];

  if (shouldShowPlaceholder) {
    return (
      <div ref={rootRef} className="bg-primary rounded-b-sm overflow-hidden">
        <div className="p-base bg-warning/5 border-t border-warning/20">
          <div className="flex items-center justify-between gap-base">
            <div className="text-sm text-low">
              <span className="font-medium text-warning">
                {t('diff.largeDiff.title')}
              </span>
              <span className="ml-base">
                {t('diff.largeDiff.linesChanged', { count: rawTotalLines })}
                <span className="text-success ml-base">
                  +{additions.toLocaleString()}
                </span>
                <span className="text-error ml-half">
                  -{deletions.toLocaleString()}
                </span>
              </span>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setForceExpanded(true);
              }}
              className="text-sm text-brand hover:text-brand-hover transition-colors"
            >
              {t('diff.largeDiff.loadAnyway')}
            </button>
          </div>
          <p className="text-xs text-low mt-half">
            {t('diff.largeDiff.warning')}
          </p>
        </div>
      </div>
    );
  }

  const fileDiffMetadata = transformDiffToFileDiffMetadata(diff, {
    ignoreWhitespace,
  });

  const computedAdditions = fileDiffMetadata.hunks.reduce(
    (acc, hunk) =>
      acc +
      hunk.hunkContent.reduce(
        (count, content) =>
          content.type === 'change'
            ? count + (content as ChangeContent).additions
            : count,
        0
      ),
    0
  );

  const computedDeletions = fileDiffMetadata.hunks.reduce(
    (acc, hunk) =>
      acc +
      hunk.hunkContent.reduce(
        (count, content) =>
          content.type === 'change'
            ? count + (content as ChangeContent).deletions
            : count,
        0
      ),
    0
  );

  const baseAnnotations = transformCommentsToAnnotations(
    commentsForFile,
    githubCommentsForFile,
    filePath
  ) as DiffLineAnnotation<ExtendedCommentAnnotation>[];

  const draftAnnotations: DiffLineAnnotation<ExtendedCommentAnnotation>[] = [];
  Object.entries(drafts).forEach(([key, draft]) => {
    if (!draft || draft.filePath !== filePath) return;
    draftAnnotations.push({
      side: mapSideToAnnotationSide(draft.side),
      lineNumber: draft.lineNumber,
      metadata: { type: 'draft', draft, widgetKey: key },
    });
  });

  const annotations = [...baseAnnotations, ...draftAnnotations];

  const renderAnnotation = (
    annotation: DiffLineAnnotation<ExtendedCommentAnnotation>
  ) => {
    const { metadata } = annotation;

    if (metadata.type === 'draft') {
      return (
        <CommentWidgetLine
          draft={metadata.draft}
          widgetKey={metadata.widgetKey}
          onSave={NOOP}
          onCancel={NOOP}
        />
      );
    }

    if (metadata.type === 'github') {
      const githubComment = metadata.comment;
      return (
        <GitHubCommentRenderer
          comment={githubComment}
          onCopyToUserComment={() => {
            const codeLine = getCodeLineForComment(
              diff,
              githubComment.lineNumber,
              githubComment.side
            );
            addComment({
              filePath,
              lineNumber: githubComment.lineNumber,
              side: githubComment.side,
              text: githubComment.body,
              ...(codeLine !== undefined ? { codeLine } : {}),
            });
          }}
        />
      );
    }

    return <ReviewCommentRenderer comment={metadata.comment} />;
  };

  const handleLineClick = (props: {
    lineNumber: number;
    annotationSide: AnnotationSide;
  }) => {
    const { lineNumber, annotationSide } = props;
    const splitSide = mapAnnotationSideToSplitSide(annotationSide);
    const widgetKey = `${filePath}-${splitSide}-${lineNumber}`;
    if (drafts[widgetKey]) return;

    const codeLine = getCodeLineForComment(diff, lineNumber, splitSide);
    setDraft(widgetKey, {
      filePath,
      side: splitSide,
      lineNumber,
      text: '',
      ...(codeLine !== undefined ? { codeLine } : {}),
    });
  };

  const renderHoverUtility = (
    getHoveredLine: () =>
      | { lineNumber: number; side: AnnotationSide }
      | undefined
  ) => (
    <button
      className="flex items-center justify-center size-icon-base rounded text-brand bg-brand/20 transition-transform hover:scale-110"
      onClick={() => {
        const line = getHoveredLine();
        if (!line) return;
        const { side, lineNumber } = line;
        const splitSide = mapAnnotationSideToSplitSide(side);
        const widgetKey = `${filePath}-${splitSide}-${lineNumber}`;
        if (drafts[widgetKey]) return;

        const codeLine = getCodeLineForComment(diff, lineNumber, splitSide);
        setDraft(widgetKey, {
          filePath,
          side: splitSide,
          lineNumber,
          text: '',
          ...(codeLine !== undefined ? { codeLine } : {}),
        });
      }}
      title={t('common:comments.addReviewComment')}
    >
      <PlusIcon className="size-3.5" weight="bold" />
    </button>
  );

  const fileDiffOptions = {
    diffStyle:
      globalMode === 'split' ? ('split' as const) : ('unified' as const),
    diffIndicators: 'classic' as const,
    themeType: actualTheme,
    overflow: wrapText ? ('wrap' as const) : ('scroll' as const),
    hunkSeparators: 'line-info' as const,
    disableFileHeader: true,
    enableHoverUtility: true,
    onLineClick: handleLineClick,
    theme: { dark: 'github-dark', light: 'github-light' } as const,
    unsafeCSS: PIERRE_DIFFS_THEME_CSS,
  };

  const totalLines = computedAdditions + computedDeletions;

  useEffect(() => {
    if (shouldShowPlaceholder) {
      onReadyChange?.(true);
      return () => onReadyChange?.(false);
    }

    const frameId = requestAnimationFrame(() => {
      const root = rootRef.current;
      const container = root?.querySelector('diffs-container');
      const shadowRoot = container?.shadowRoot ?? null;
      const renderedLines = shadowRoot?.querySelectorAll('[data-line]') ?? null;

      if (shadowRoot && (renderedLines?.length ?? 0) > 0) {
        onReadyChange?.(true);
      }
    });

    return () => {
      cancelAnimationFrame(frameId);
      onReadyChange?.(false);
    };
  }, [
    additions,
    deletions,
    filePath,
    onReadyChange,
    shouldShowPlaceholder,
    totalLines,
  ]);

  return (
    <div ref={rootRef} className="bg-primary rounded-b-sm overflow-hidden">
      <FileDiff
        fileDiff={fileDiffMetadata}
        options={fileDiffOptions}
        lineAnnotations={annotations}
        renderAnnotation={renderAnnotation}
        renderHoverUtility={renderHoverUtility}
      />
    </div>
  );
}
