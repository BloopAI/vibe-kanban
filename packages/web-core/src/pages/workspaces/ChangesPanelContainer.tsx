import { memo, useEffect, useCallback, useRef, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CaretDownIcon,
  CopyIcon,
  GithubLogoIcon,
  PlusIcon,
} from '@phosphor-icons/react';
import {
  FileDiff,
  Virtualizer,
  WorkerPoolContextProvider,
} from '@pierre/diffs/react';
import type { DiffLineAnnotation, AnnotationSide } from '@pierre/diffs';
const WorkerUrl = new URL('@pierre/diffs/worker/worker.js', import.meta.url)
  .href;
import { sortDiffs } from '@/shared/lib/fileTreeUtils';
import { useChangesView } from '@/shared/hooks/useChangesView';
import { useScrollSyncStateMachine } from '@/shared/hooks/useScrollSyncStateMachine';
import { useFileInViewStore } from '@/shared/stores/useFileInViewStore';
import {
  useDiffs,
  useShowGitHubComments,
  useGetGitHubCommentsForFile,
} from '@/shared/stores/useWorkspaceDiffStore';
import { useUiPreferencesStore } from '@/shared/stores/useUiPreferencesStore';
import {
  useDiffViewMode,
  useWrapTextDiff,
  useIgnoreWhitespaceDiff,
} from '@/shared/stores/useDiffViewStore';
import { useTheme } from '@/shared/hooks/useTheme';
import { getActualTheme } from '@/shared/lib/theme';
import { useReview, type ReviewDraft } from '@/shared/hooks/useReview';
import {
  transformDiffToFileDiffMetadata,
  transformCommentsToAnnotations,
  type CommentAnnotation,
} from '@/shared/lib/diffDataAdapter';
import { DiffSide } from '@/shared/types/diff';
import { isRealMobileDevice } from '@/shared/hooks/useIsMobile';
import { useOpenInEditor } from '@/shared/hooks/useOpenInEditor';
import { OpenInIdeButton } from '@/shared/components/OpenInIdeButton';
import { CopyButton } from '@/shared/components/CopyButton';
import { writeClipboardViaBridge } from '@/shared/lib/clipboard';
import { getFileIcon } from '@/shared/lib/fileTypeIcon';
import { stripLineEnding, splitLines } from '@/shared/lib/string';
import { ReviewCommentRenderer } from './ReviewCommentRenderer';
import { GitHubCommentRenderer } from './GitHubCommentRenderer';
import { CommentWidgetLine } from './CommentWidgetLine';
import type { Diff, DiffChangeKind } from 'shared/types';

function workerFactory() {
  return new Worker(WorkerUrl, { type: 'module' });
}

const POOL_OPTIONS = { workerFactory, poolSize: 3 };
const HIGHLIGHTER_OPTIONS = {
  theme: { dark: 'github-dark', light: 'github-light' } as const,
  langs: [] as string[],
};

const COLLAPSE_BY_CHANGE_TYPE: Record<DiffChangeKind, boolean> = {
  added: false,
  deleted: true,
  modified: false,
  renamed: true,
  copied: true,
  permissionChange: true,
};

const COLLAPSE_MAX_LINES = 800;

function shouldAutoCollapse(diff: Diff): boolean {
  const totalLines = (diff.additions ?? 0) + (diff.deletions ?? 0);
  if (diff.change === 'renamed') {
    return totalLines === 0 || totalLines > COLLAPSE_MAX_LINES;
  }
  if (COLLAPSE_BY_CHANGE_TYPE[diff.change]) return true;
  if (totalLines > COLLAPSE_MAX_LINES) return true;
  return false;
}

const IS_MOBILE = isRealMobileDevice();
const NOOP = () => {};

const PIERRE_DIFFS_THEME_CSS = `
  :host {
    position: relative;
  }

  [data-diffs-header] {
    background-color: hsl(var(--bg-primary));
    min-height: 40px;
    position: sticky;
    top: 0;
    z-index: 10;
    cursor: pointer;
    padding-inline: 12px;
    border-radius: 4px 4px 0 0;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.875rem;
    line-height: 1.25rem;
  }

  [data-diffs-header]::before {
    content: '';
    position: absolute;
    top: -6px;
    left: -4px;
    right: -4px;
    height: 6px;
    background-color: hsl(var(--bg-secondary));
  }

  [data-diffs-header] [data-additions-count],
  [data-diffs-header] [data-deletions-count] {
    display: none;
  }

  [data-diffs-header] [data-change-icon] {
    display: none;
  }

  [data-diffs-header] [data-metadata] {
    font-family: inherit;
    font-size: 0.75rem;
    gap: 8px;
  }

  [data-code] {
    border-radius: 0 0 4px 4px;
  }

  [data-separator="line-info"][data-separator-first] {
    margin-top: 4px;
  }
  [data-separator="line-info"][data-separator-last] {
    margin-bottom: 4px;
  }

  [data-indicators='classic'] [data-column-content] {
    position: relative;
    padding-inline-start: 34px;
  }

  [data-indicators='classic'] [data-line-type='change-addition'] [data-column-content]::before,
  [data-indicators='classic'] [data-line-type='change-deletion'] [data-column-content]::before {
    left: 22px;
  }

  [data-hover-slot] {
    right: auto;
    left: calc(var(--diffs-column-number-width, 3ch) - 25px);
    width: 22px;
  }

  [data-annotation-content] {
    grid-column: 1 / -1;
    left: 0;
    width: var(--diffs-column-width, 100%);
    max-width: 100%;
  }
  
  [data-line-annotation] {
    grid-column: 1 / -1;
  }

  [data-code] {
    padding-bottom: 0;
  }
  [data-code]::-webkit-scrollbar {
    height: 8px;
    background: transparent;
  }
  [data-code]::-webkit-scrollbar-track {
    background: transparent;
  }
  [data-code]::-webkit-scrollbar-thumb {
    background-color: transparent;
    border-radius: 4px;
  }
  [data-code]:hover::-webkit-scrollbar-thumb {
    background-color: hsl(var(--text-low) / 0.3);
  }

  [data-diff][data-theme-type='light'] {
    --diffs-gap-style: none;
    --diffs-light-bg: hsl(var(--bg-primary));
    --diffs-bg-context-override: hsl(var(--bg-primary));
    --diffs-bg-separator-override: hsl(var(--bg-primary));
    --diffs-light-addition-color: hsl(160, 77%, 35%);
    --diffs-bg-addition-override: hsl(160, 77%, 88%);
    --diffs-bg-addition-number-override: hsl(160, 77%, 85%);
    --diffs-bg-addition-hover-override: hsl(160, 77%, 82%);
    --diffs-light-deletion-color: hsl(10, 100%, 40%);
    --diffs-bg-deletion-override: hsl(10, 100%, 90%);
    --diffs-bg-deletion-number-override: hsl(10, 100%, 87%);
    --diffs-bg-deletion-hover-override: hsl(10, 100%, 84%);
    --diffs-fg-number-override: hsl(var(--text-low));
  }

  [data-diff][data-theme-type='dark'] {
    --diffs-gap-style: none;
    --diffs-dark-bg: hsl(var(--bg-panel));
    --diffs-bg-context-override: hsl(var(--bg-panel));
    --diffs-bg-separator-override: hsl(var(--bg-panel));
    --diffs-bg-hover-override: hsl(0, 0%, 22%);
    --diffs-dark-addition-color: hsl(130, 50%, 50%);
    --diffs-bg-addition-override: hsl(130, 30%, 20%);
    --diffs-bg-addition-number-override: hsl(130, 30%, 18%);
    --diffs-bg-addition-hover-override: hsl(130, 30%, 25%);
    --diffs-dark-deletion-color: hsl(12, 50%, 55%);
    --diffs-bg-deletion-override: hsl(12, 30%, 18%);
    --diffs-bg-deletion-number-override: hsl(12, 30%, 16%);
    --diffs-bg-deletion-hover-override: hsl(12, 30%, 23%);
    --diffs-fg-number-override: hsl(var(--text-low));
  }
`;

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

function scrollToLineInDiff(fileEl: HTMLElement, lineNumber: number): void {
  const container = fileEl.querySelector('diffs-container');
  const shadowRoot = container?.shadowRoot ?? null;
  if (shadowRoot) {
    const lineEl = shadowRoot.querySelector(`[data-line="${lineNumber}"]`);
    if (lineEl instanceof HTMLElement) {
      lineEl.scrollIntoView({ behavior: 'instant', block: 'nearest' });
    }
  }
}

const DIFF_CACHE_MAX = 200;

class LruCache<K, V> {
  private map = new Map<K, V>();
  constructor(private max: number) {}
  get(key: K): V | undefined {
    const val = this.map.get(key);
    if (val !== undefined) {
      this.map.delete(key);
      this.map.set(key, val);
    }
    return val;
  }
  set(key: K, val: V): void {
    if (this.map.has(key)) this.map.delete(key);
    else if (this.map.size >= this.max) {
      this.map.delete(this.map.keys().next().value!);
    }
    this.map.set(key, val);
  }
  clear(): void {
    this.map.clear();
  }
}

const fileDiffCache = new LruCache<
  string,
  {
    diff: Diff;
    ignoreWhitespace: boolean;
    result: ReturnType<typeof transformDiffToFileDiffMetadata>;
  }
>(DIFF_CACHE_MAX);

function getCachedFileDiffMetadata(diff: Diff, ignoreWhitespace: boolean) {
  const path = diff.newPath || diff.oldPath || '';
  const cached = fileDiffCache.get(path);
  if (
    cached &&
    cached.diff === diff &&
    cached.ignoreWhitespace === ignoreWhitespace
  ) {
    return cached.result;
  }
  const result = transformDiffToFileDiffMetadata(diff, { ignoreWhitespace });
  fileDiffCache.set(path, { diff, ignoreWhitespace, result });
  return result;
}

interface DiffFileItemProps {
  diff: Diff;
  initialExpanded: boolean;
  workspaceId: string;
}

const DiffFileItem = memo(function DiffFileItem({
  diff,
  initialExpanded,
  workspaceId,
}: DiffFileItemProps) {
  const { t } = useTranslation('common');
  const filePath = diff.newPath || diff.oldPath || '';
  const expandKey = `diff:${filePath}`;

  const expanded = useUiPreferencesStore(
    (s) => s.expanded[expandKey] ?? initialExpanded
  );

  const { theme } = useTheme();
  const actualTheme = getActualTheme(theme);
  const globalMode = useDiffViewMode();
  const wrapText = useWrapTextDiff();
  const ignoreWhitespace = useIgnoreWhitespaceDiff();

  const { comments, drafts, setDraft, addComment } = useReview();
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;

  const showGitHubComments = useShowGitHubComments();
  const getGitHubCommentsForFile = useGetGitHubCommentsForFile();

  const openInEditor = useOpenInEditor(workspaceId);

  const fileDiffMetadata = useMemo(
    () => getCachedFileDiffMetadata(diff, ignoreWhitespace),
    [diff, ignoreWhitespace]
  );

  const commentsForFile = useMemo(
    () => comments.filter((c) => c.filePath === filePath),
    [comments, filePath]
  );

  const githubCommentsForFile = useMemo(
    () => (showGitHubComments ? getGitHubCommentsForFile(filePath) : []),
    [showGitHubComments, getGitHubCommentsForFile, filePath]
  );

  const annotations = useMemo(() => {
    const base = transformCommentsToAnnotations(
      commentsForFile,
      githubCommentsForFile,
      filePath
    ) as DiffLineAnnotation<ExtendedCommentAnnotation>[];

    const draftAnns: DiffLineAnnotation<ExtendedCommentAnnotation>[] = [];
    Object.entries(drafts).forEach(([key, draft]) => {
      if (!draft || draft.filePath !== filePath) return;
      draftAnns.push({
        side: mapSideToAnnotationSide(draft.side),
        lineNumber: draft.lineNumber,
        metadata: { type: 'draft', draft, widgetKey: key },
      });
    });

    return base.length > 0 || draftAnns.length > 0
      ? [...base, ...draftAnns]
      : undefined;
  }, [commentsForFile, githubCommentsForFile, filePath, drafts]);

  const handleLineClick = useCallback(
    (props: { lineNumber: number; annotationSide: AnnotationSide }) => {
      const { lineNumber, annotationSide } = props;
      const splitSide = mapAnnotationSideToSplitSide(annotationSide);
      const widgetKey = `${filePath}-${splitSide}-${lineNumber}`;
      if (draftsRef.current[widgetKey]) return;

      const codeLine = getCodeLineForComment(diff, lineNumber, splitSide);
      setDraft(widgetKey, {
        filePath,
        side: splitSide,
        lineNumber,
        text: '',
        ...(codeLine !== undefined ? { codeLine } : {}),
      });
    },
    [filePath, diff, setDraft]
  );

  const options = useMemo(
    () => ({
      diffStyle:
        globalMode === 'split' ? ('split' as const) : ('unified' as const),
      diffIndicators: 'classic' as const,
      themeType: actualTheme,
      overflow: wrapText ? ('wrap' as const) : ('scroll' as const),
      hunkSeparators: 'line-info' as const,
      collapsed: !expanded,
      enableHoverUtility: true,
      onLineClick: handleLineClick,
      theme: { dark: 'github-dark', light: 'github-light' } as const,
      unsafeCSS: PIERRE_DIFFS_THEME_CSS,
    }),
    [globalMode, actualTheme, wrapText, expanded, handleLineClick]
  );

  const handleToggle = useCallback(() => {
    useUiPreferencesStore.getState().toggleExpanded(expandKey, initialExpanded);
  }, [expandKey, initialExpanded]);

  const handleCopyFilePath = useCallback(() => {
    void writeClipboardViaBridge(filePath);
  }, [filePath]);

  const handleOpenInIde = useCallback(() => {
    openInEditor({ filePath });
  }, [openInEditor, filePath]);

  const githubCommentCount = githubCommentsForFile.length;

  const additions = diff.additions ?? 0;
  const deletions = diff.deletions ?? 0;

  const renderHeaderMetadata = useCallback(
    () => (
      <div
        className="flex items-center gap-2 shrink-0 text-xs"
        onClick={(e) => e.stopPropagation()}
      >
        <CopyButton
          onCopy={handleCopyFilePath}
          disabled={false}
          iconSize="size-icon-xs"
          icon={CopyIcon}
        />
        {(additions > 0 || deletions > 0) && (
          <span className="inline-flex items-center gap-1 font-mono">
            {additions > 0 && (
              <span className="text-success">+{additions}</span>
            )}
            {deletions > 0 && <span className="text-error">-{deletions}</span>}
          </span>
        )}
        {githubCommentCount > 0 && (
          <span className="inline-flex items-center gap-0.5 text-low">
            <GithubLogoIcon className="size-icon-xs" weight="fill" />
            {githubCommentCount}
          </span>
        )}
        {!IS_MOBILE && (
          <OpenInIdeButton
            onClick={handleOpenInIde}
            className="size-icon-xs p-0"
          />
        )}
        <CaretDownIcon
          className={`size-icon-xs text-low transition-transform cursor-pointer${!expanded ? ' -rotate-90' : ''}`}
          onClick={handleToggle}
        />
      </div>
    ),
    [
      handleCopyFilePath,
      handleOpenInIde,
      expanded,
      handleToggle,
      githubCommentCount,
      additions,
      deletions,
    ]
  );

  const FileIcon = useMemo(
    () => getFileIcon(filePath, actualTheme),
    [filePath, actualTheme]
  );

  const renderHeaderPrefix = useCallback(
    () => <FileIcon className="size-icon-base shrink-0" />,
    [FileIcon]
  );

  const renderAnnotation = useCallback(
    (annotation: DiffLineAnnotation<ExtendedCommentAnnotation>) => {
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
            theme={actualTheme}
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
    },
    [diff, filePath, addComment, actualTheme]
  );

  const renderHoverUtility = useCallback(
    (
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
          if (draftsRef.current[widgetKey]) return;

          const codeLine = getCodeLineForComment(diff, lineNumber, splitSide);
          setDraft(widgetKey, {
            filePath,
            side: splitSide,
            lineNumber,
            text: '',
            ...(codeLine !== undefined ? { codeLine } : {}),
          });
        }}
        title={t('comments.addReviewComment')}
      >
        <PlusIcon className="size-3.5" weight="bold" />
      </button>
    ),
    [filePath, diff, setDraft, t]
  );

  return (
    <div data-diff-path={filePath} className="rounded-sm">
      <FileDiff<ExtendedCommentAnnotation>
        fileDiff={fileDiffMetadata}
        options={options}
        lineAnnotations={annotations}
        renderAnnotation={annotations ? renderAnnotation : undefined}
        renderHeaderPrefix={renderHeaderPrefix}
        renderHeaderMetadata={renderHeaderMetadata}
        renderHoverUtility={expanded ? renderHoverUtility : undefined}
      />
    </div>
  );
});

interface ChangesPanelContainerProps {
  className: string;
  workspaceId: string;
}

const MOUNT_BATCH_SIZE = 8;

export const ChangesPanelContainer = memo(function ChangesPanelContainer({
  className,
  workspaceId,
}: ChangesPanelContainerProps) {
  const diffs = useDiffs();
  const { registerScrollToFile } = useChangesView();
  const [processedPaths] = useState(() => new Set<string>());
  const [mountedCount, setMountedCount] = useState(0);
  const rafRef = useRef<number | null>(null);

  const diffItems = useMemo(() => {
    const sorted = sortDiffs(diffs);
    return sorted.map((diff) => {
      const path = diff.newPath || diff.oldPath || '';

      let initialExpanded = true;
      if (!processedPaths.has(path)) {
        processedPaths.add(path);
        initialExpanded = !shouldAutoCollapse(diff);
      }

      return { diff, initialExpanded };
    });
  }, [diffs, processedPaths]);

  useEffect(() => {
    if (diffItems.length === 0) {
      setMountedCount(0);
      return;
    }

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    setMountedCount((prev) => {
      if (prev >= diffItems.length) return diffItems.length;
      return prev;
    });

    let cancelled = false;
    function mountNextBatch() {
      if (cancelled) return;
      setMountedCount((prev) => {
        const next = Math.min(prev + MOUNT_BATCH_SIZE, diffItems.length);
        if (next < diffItems.length) {
          rafRef.current = requestAnimationFrame(mountNextBatch);
        } else {
          rafRef.current = null;
        }
        return next;
      });
    }

    rafRef.current = requestAnimationFrame(mountNextBatch);

    return () => {
      cancelled = true;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [diffItems]);

  const virtualizerRef = useRef<{
    scrollFileToTop: (el: HTMLElement) => Promise<void>;
  } | null>(null);
  const topBandCandidatesRef = useRef<Set<HTMLElement>>(new Set());
  const latestScrollRequestRef = useRef<number | null>(null);

  const itemsToRender =
    mountedCount >= diffItems.length
      ? diffItems
      : diffItems.slice(0, mountedCount);

  const orderedPaths = useMemo(
    () => diffItems.map(({ diff }) => diff.newPath || diff.oldPath || ''),
    [diffItems]
  );

  const pathToIndex = useMemo(
    () => new Map(orderedPaths.map((p, i) => [p, i])),
    [orderedPaths]
  );

  const indexToPath = useCallback(
    (index: number) => orderedPaths[index] ?? null,
    [orderedPaths]
  );

  const handleFileInViewChanged = useCallback((path: string | null) => {
    useFileInViewStore.getState().setFileInView(path);
  }, []);

  const {
    scrollToFile: beginProgrammaticScroll,
    onRangeChanged: updateFileInViewFromRange,
    onScrollComplete,
  } = useScrollSyncStateMachine({
    pathToIndex,
    indexToPath,
    onFileInViewChanged: handleFileInViewChanged,
  });

  const pathToIndexRef = useRef(pathToIndex);
  pathToIndexRef.current = pathToIndex;
  const updateFIVRef = useRef(updateFileInViewFromRange);
  updateFIVRef.current = updateFileInViewFromRange;

  const hasItems = itemsToRender.length > 0;

  useEffect(() => {
    if (!hasItems) return;

    const firstWrapper = document.querySelector('[data-diff-path]');
    const scrollRoot =
      firstWrapper instanceof HTMLElement
        ? firstWrapper.closest('.overflow-auto')
        : null;

    if (!(scrollRoot instanceof HTMLElement)) return;

    topBandCandidatesRef.current.clear();

    const intersectionObs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!(entry.target instanceof HTMLElement)) continue;
          if (!entry.target.isConnected) {
            topBandCandidatesRef.current.delete(entry.target);
            continue;
          }
          if (entry.isIntersecting) {
            topBandCandidatesRef.current.add(entry.target);
          } else {
            topBandCandidatesRef.current.delete(entry.target);
          }
        }

        let topPath: string | null = null;
        let minDist = Infinity;
        const rootTop = scrollRoot.getBoundingClientRect().top;

        for (const el of topBandCandidatesRef.current) {
          if (!el.isConnected) {
            topBandCandidatesRef.current.delete(el);
            continue;
          }
          const dist = Math.abs(el.getBoundingClientRect().top - rootTop);
          if (dist < minDist) {
            minDist = dist;
            topPath = el.dataset.diffPath ?? null;
          }
        }

        if (topPath) {
          const idx = pathToIndexRef.current.get(topPath);
          if (idx !== undefined) {
            updateFIVRef.current({ startIndex: idx, endIndex: idx });
          }
        }
      },
      {
        root: scrollRoot,
        rootMargin: '0px 0px -90% 0px',
        threshold: 0,
      }
    );

    scrollRoot
      .querySelectorAll<HTMLElement>('[data-diff-path]')
      .forEach((el) => intersectionObs.observe(el));

    const mutationObs = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          if (node.dataset.diffPath !== undefined) {
            intersectionObs.observe(node);
          }
          node
            .querySelectorAll<HTMLElement>('[data-diff-path]')
            .forEach((child) => intersectionObs.observe(child));
        }
      }
    });
    mutationObs.observe(scrollRoot, { childList: true, subtree: true });

    return () => {
      topBandCandidatesRef.current.clear();
      intersectionObs.disconnect();
      mutationObs.disconnect();
    };
  }, [hasItems]);

  const handleScrollToFile = useCallback(
    (path: string, lineNumber?: number) => {
      const expandKey = `diff:${path}`;
      const expandedState = useUiPreferencesStore.getState().expanded;
      if (!(expandedState[expandKey] ?? false)) {
        useUiPreferencesStore.getState().setExpanded(expandKey, true);
      }

      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
        setMountedCount(diffItems.length);
      }

      const requestId = beginProgrammaticScroll(path, lineNumber);
      if (requestId === null) return;
      latestScrollRequestRef.current = requestId;

      requestAnimationFrame(() => {
        const wrapper = document.querySelector(
          `[data-diff-path="${CSS.escape(path)}"]`
        );
        if (!(wrapper instanceof HTMLElement)) {
          onScrollComplete(requestId);
          return;
        }

        const fileContainer = wrapper.querySelector('diffs-container');
        if (!(fileContainer instanceof HTMLElement)) {
          onScrollComplete(requestId);
          return;
        }

        const virtualizer = virtualizerRef.current;
        if (!virtualizer) {
          onScrollComplete(requestId);
          return;
        }

        void virtualizer
          .scrollFileToTop(fileContainer)
          .then(() => {
            if (lineNumber && latestScrollRequestRef.current === requestId) {
              scrollToLineInDiff(wrapper, lineNumber);
            }
          })
          .finally(() => {
            requestAnimationFrame(() => onScrollComplete(requestId));
          });
      });
    },
    [diffItems.length, beginProgrammaticScroll, onScrollComplete]
  );

  useEffect(() => {
    registerScrollToFile(handleScrollToFile);
    return () => {
      registerScrollToFile(null);
    };
  }, [registerScrollToFile, handleScrollToFile]);

  return (
    <WorkerPoolContextProvider
      poolOptions={POOL_OPTIONS}
      highlighterOptions={HIGHLIGHTER_OPTIONS}
    >
      <Virtualizer
        {...({ ref: virtualizerRef } as Record<string, unknown>)}
        className={`w-full h-full overflow-auto bg-secondary px-base pt-1 ${className}`}
        contentClassName="flex flex-col gap-1"
        style={{ contain: 'layout style paint' }}
      >
        {itemsToRender.map(({ diff, initialExpanded }) => {
          const path = diff.newPath || diff.oldPath || '';
          return (
            <DiffFileItem
              key={path}
              diff={diff}
              initialExpanded={initialExpanded}
              workspaceId={workspaceId}
            />
          );
        })}
      </Virtualizer>
    </WorkerPoolContextProvider>
  );
});
