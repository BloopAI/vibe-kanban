import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { DiffView, DiffModeEnum } from "@git-diff-view/react";
import "@git-diff-view/react/styles/diff-view.css";
import "../styles/diff-overrides.css";
import { getReview, getFileContent, getDiff } from "../api";
import type { ReviewResult, ReviewComment } from "../types/review";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import {
  parseUnifiedDiff,
  getFileDiff,
  buildFullFileDiff,
  synthesizeFragmentDiff,
  type ParsedFileDiff,
} from "../lib/diff-parser";
import { getHighlightLanguageFromPath } from "../lib/extToLanguage";
import { CodeFragmentCard } from "../components/CodeFragmentCard";

function diffHasChanges(diffString: string): boolean {
  return diffString.split("\n").some((line) => {
    if (!line) return false;
    if (line.startsWith("--- ") || line.startsWith("+++ ") || line.startsWith("@@")) return false;
    return line[0] === "+" || line[0] === "-";
  });
}

type FileCache = Map<string, string>;

export default function ReviewPage() {
  const { id } = useParams<{ id: string }>();
  const [review, setReview] = useState<ReviewResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fileCache, setFileCache] = useState<FileCache>(new Map());
  const [loadingFiles, setLoadingFiles] = useState<Set<string>>(new Set());
  const [scrollProgress, setScrollProgress] = useState(0);
  const [diffText, setDiffText] = useState<string>("");

  const parsedDiffs = useMemo(() => parseUnifiedDiff(diffText), [diffText]);

  useEffect(() => {
    if (!id) return;

    setLoading(true);
    setError(null);

    Promise.all([getReview(id), getDiff(id)])
      .then(([reviewData, diffData]) => {
        setReview(reviewData);
        setDiffText(diffData);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Failed to load review");
        setLoading(false);
      });
  }, [id]);

  const pathToHash = useMemo(() => {
    if (!review) return new Map<string, string>();
    const map = new Map<string, string>();
    for (const [hash, path] of Object.entries(review.fileHashMap)) {
      map.set(path, hash);
    }
    return map;
  }, [review]);

  const fetchFile = useCallback(
    async (filePath: string) => {
      if (!id || !review) return;

      const hash = pathToHash.get(filePath);
      if (!hash) return;

      if (fileCache.has(filePath)) return;

      setLoadingFiles((prev) => new Set(prev).add(filePath));

      try {
        const content = await getFileContent(id, hash);
        setFileCache((prev) => new Map(prev).set(filePath, content));
      } catch (err) {
        console.error(`Failed to fetch file ${filePath}:`, err);
      } finally {
        setLoadingFiles((prev) => {
          const next = new Set(prev);
          next.delete(filePath);
          return next;
        });
      }
    },
    [id, review, pathToHash, fileCache],
  );

  useEffect(() => {
    if (!review) return;

    const allFiles = new Set<string>();
    for (const comment of review.comments) {
      for (const fragment of comment.fragments) {
        allFiles.add(fragment.file);
      }
    }

    for (const filePath of allFiles) {
      if (!fileCache.has(filePath)) {
        fetchFile(filePath);
      }
    }
  }, [review, fileCache, fetchFile]);

  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = docHeight > 0 ? Math.min(1, scrollTop / docHeight) : 0;
      setScrollProgress(progress);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const prMetadata = {
    author: {
      name: "Full Name",
      avatarUrl: "https://github.com/ghost.png",
    },
    repo: {
      org: "example",
      name: "repo",
    },
    pr: {
      number: 0,
      title: "Pull Request Title",
      description:
        "Pull request description goes here. This will be replaced with real data from the API.",
    },
  };

  useEffect(() => {
    if (review) {
      document.title = `Review: ${prMetadata.pr.title} · ${prMetadata.repo.org}/${prMetadata.repo.name}#${prMetadata.pr.number}`;
    }
  }, [review, prMetadata.pr.title, prMetadata.repo.org, prMetadata.repo.name, prMetadata.pr.number]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground mx-auto mb-4"></div>
          <p className="text-muted-foreground text-sm">Loading review...</p>
        </div>
      </div>
    );
  }

  if (error || !review) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-6 h-6 text-destructive"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-foreground mb-2">
            {error || "Review not found"}
          </h1>
          <p className="text-muted-foreground text-sm">
            The review you're looking for doesn't exist or has been removed.
          </p>
        </div>
      </div>
    );
  }

  const totalFragments = review.comments.reduce(
    (sum, comment) => sum + comment.fragments.length,
    0,
  );

  const prUrl = `https://github.com/${prMetadata.repo.org}/${prMetadata.repo.name}/pull/${prMetadata.pr.number}`;
  const hasDiff = parsedDiffs.length > 0;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Scroll Progress Bar */}
      <div className="fixed top-0 left-0 right-0 h-1 bg-muted z-50">
        <div
          className="h-full bg-primary transition-[width] duration-75"
          style={{ width: `${scrollProgress * 100}%` }}
        />
      </div>

      {/* Header - Two Column Layout */}
      <div className="border-b px-4 py-5 mt-1">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-6">
          {/* Left Column - PR Info */}
          <div className="flex items-start gap-3">
            <img
              src={prMetadata.author.avatarUrl}
              alt={prMetadata.author.name}
              className="w-10 h-10 rounded-full shrink-0"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <svg
                  className="h-4 w-4 shrink-0"
                  fill="currentColor"
                  viewBox="0 0 16 16"
                >
                  <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z" />
                </svg>
                <a
                  href={prUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-foreground hover:underline"
                >
                  {prMetadata.repo.org}/{prMetadata.repo.name}
                </a>
                <a
                  href={prUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                >
                  #{prMetadata.pr.number}
                </a>
                <span className="px-1.5 py-0.5 bg-muted text-muted-foreground rounded text-xs">
                  Unlisted
                </span>
              </div>
              <h1 className="text-base font-semibold text-foreground leading-snug">
                {prMetadata.pr.title}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                by {prMetadata.author.name}
              </p>
              {prMetadata.pr.description && (
                <p className="text-sm text-muted-foreground mt-2 line-clamp-3">
                  {prMetadata.pr.description}
                </p>
              )}
            </div>
          </div>

          {/* Right Column - Review Summary */}
          <div className="border-l border-border pl-6">
            <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Review Summary
            </h2>
            <MarkdownRenderer content={review.summary} className="text-sm" />
            <div className="mt-3 flex items-center gap-4 text-sm text-muted-foreground">
              <span>{review.comments.length} comments</span>
              <span>•</span>
              <span>{totalFragments} code references</span>
            </div>
          </div>
        </div>
      </div>

      {/* Comments List - Two Column Grid Layout */}
      <div className="px-3 pb-4 flex-1">
        <div className="divide-y font-sans">
          {review.comments.map((comment, idx) => (
            <CommentStoryRow
              key={idx}
              index={idx + 1}
              comment={comment}
              fileCache={fileCache}
              loadingFiles={loadingFiles}
              parsedDiffs={parsedDiffs}
              hasDiff={hasDiff}
            />
          ))}
        </div>
      </div>

      {/* Footer - Promotional */}
      <div className="border-t px-4 py-6 bg-muted/30">
        <div className="text-center">
          <p className="text-sm text-muted-foreground mb-2">
            Generate AI-powered code reviews for your pull requests
          </p>
          <code className="inline-block bg-secondary px-3 py-2 rounded-md text-sm font-mono text-foreground">
            npx vibe-kanban review https://github.com/owner/repo/pull/123
          </code>
        </div>
      </div>
    </div>
  );
}

interface CommentStoryRowProps {
  index: number;
  comment: ReviewComment;
  fileCache: FileCache;
  loadingFiles: Set<string>;
  parsedDiffs: ParsedFileDiff[];
  hasDiff: boolean;
}

function CommentStoryRow({
  index,
  comment,
  fileCache,
  loadingFiles,
  parsedDiffs,
  hasDiff,
}: CommentStoryRowProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const hasComment = comment.comment && comment.comment.trim().length > 0;

  return (
    <div className="py-6">
      {/* Collapsible Header */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center gap-3 text-left hover:bg-muted/30 rounded-lg p-2 -ml-2 transition-colors"
      >
        <svg
          className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-medium shrink-0">
          {index}
        </span>
        <span className="text-sm text-foreground line-clamp-1 flex-1 min-w-0">
          {hasComment ? comment.comment.split('\n')[0].replace(/^#+\s*/, '') : '(No comment text)'}
        </span>
        <span className="text-xs text-muted-foreground shrink-0">
          {comment.fragments.length} fragment{comment.fragments.length !== 1 ? 's' : ''}
        </span>
      </button>

      {/* Collapsible Content */}
      {!isCollapsed && (
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-6 mt-4 pl-9">
          {/* Left Column - Comment */}
          <div className="sticky top-4 self-start max-h-[calc(100vh-2rem)] overflow-y-auto min-w-0">
            {hasComment ? (
              <MarkdownRenderer
                content={comment.comment}
                className="text-sm min-w-0"
              />
            ) : (
              <span className="text-sm text-muted-foreground italic">
                (No comment text)
              </span>
            )}
          </div>

          {/* Right Column - Code Fragments */}
          <div className="space-y-3 min-w-0 overflow-x-auto">
            {comment.fragments.length > 0 ? (
              comment.fragments.map((fragment, fIdx) => (
                <DiffFragmentCard
                  key={`${fragment.file}:${fragment.start_line}-${fragment.end_line}:${fIdx}`}
                  file={fragment.file}
                  startLine={fragment.start_line}
                  endLine={fragment.end_line}
                  message={fragment.message}
                  parsedDiffs={parsedDiffs}
                  fileContent={fileCache.get(fragment.file)}
                  isLoading={loadingFiles.has(fragment.file)}
                  hasDiff={hasDiff}
                />
              ))
            ) : (
              <div className="text-sm text-muted-foreground">
                No code fragments for this comment.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface DiffFragmentCardProps {
  file: string;
  startLine: number;
  endLine: number;
  message: string;
  parsedDiffs: ParsedFileDiff[];
  fileContent?: string;
  isLoading?: boolean;
  hasDiff: boolean;
}

function DiffFragmentCard({
  file,
  startLine,
  endLine,
  message,
  parsedDiffs,
  fileContent,
  isLoading,
  hasDiff,
}: DiffFragmentCardProps) {
  const [viewMode, setViewMode] = useState<"fragment" | "file">("fragment");

  const fileDiff = useMemo(() => getFileDiff(parsedDiffs, file), [parsedDiffs, file]);
  const lang = getHighlightLanguageFromPath(file);

  const diffData = useMemo(() => {
    if (!fileDiff) return null;

    if (viewMode === "file") {
      const diffString = buildFullFileDiff(fileDiff);
      if (!diffString) return null;
      return {
        hasChanges: true,
        hunks: [diffString],
        oldFile: { fileName: file, fileLang: lang },
        newFile: { fileName: file, fileLang: lang },
      };
    }

    if (!fileContent) return null;

    const diffString = synthesizeFragmentDiff(
      fileDiff,
      fileContent,
      startLine,
      endLine,
      3
    );

    if (!diffString) return null;

    return {
      hasChanges: diffHasChanges(diffString),
      hunks: [diffString],
      oldFile: { fileName: file, fileLang: lang },
      newFile: { fileName: file, fileLang: lang },
    };
  }, [fileDiff, file, lang, startLine, endLine, viewMode, fileContent]);

  if (!hasDiff || !fileDiff) {
    return (
      <div className="border rounded bg-muted/40 p-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-mono truncate">{file}</span>
          <span className="shrink-0">
            Lines {startLine}
            {endLine !== startLine && `–${endLine}`}
          </span>
        </div>
        {message && (
          <div className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400 mt-1.5 italic">
            <svg className="h-3.5 w-3.5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
            <span>{message}</span>
          </div>
        )}
        {isLoading ? (
          <div className="mt-2 flex items-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-muted-foreground/60"></div>
            <span className="text-xs text-muted-foreground">Loading...</span>
          </div>
        ) : (
          <div className="mt-2 text-xs text-muted-foreground">
            No diff available for this file.
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="border rounded bg-muted/40 overflow-hidden">
      <div className="px-3 py-2 border-b bg-muted/60">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
            <span className="font-mono truncate">{file}</span>
            <span className="shrink-0">
              Lines {startLine}
              {endLine !== startLine && `–${endLine}`}
            </span>
            {diffData && !diffData.hasChanges && (
              <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground">
                Unchanged
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0 ml-auto">
            <button
              className="h-6 px-2 rounded hover:bg-muted transition-colors flex items-center justify-center text-xs"
              onClick={() =>
                setViewMode((prev) => (prev === "fragment" ? "file" : "fragment"))
              }
              title={
                viewMode === "fragment" ? "View full file diff" : "View fragment only"
              }
            >
              {viewMode === "fragment" ? "Full Diff" : "Fragment"}
            </button>
          </div>
        </div>
        {message && (
          <div className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400 mt-1.5 italic">
            <svg className="h-3.5 w-3.5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
            <span>{message}</span>
          </div>
        )}
      </div>

      {diffData ? (
        diffData.hasChanges ? (
          <div className="diff-view-container">
            <DiffView
              data={diffData}
              diffViewMode={DiffModeEnum.Unified}
              diffViewTheme="dark"
              diffViewHighlight
              diffViewFontSize={12}
              diffViewWrap={false}
            />
          </div>
        ) : fileContent ? (
          <CodeFragmentCard
            fragment={{ file, start_line: startLine, end_line: endLine, message: "" }}
            fileContent={fileContent}
            isLoading={isLoading}
            hideHeader
          />
        ) : (
          <div className="px-3 py-4 text-xs text-muted-foreground">
            No changes in this fragment range.
          </div>
        )
      ) : isLoading ? (
        <div className="px-3 py-4 flex items-center gap-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-muted-foreground/60"></div>
          <span className="text-xs text-muted-foreground">Loading file content...</span>
        </div>
      ) : (
        <div className="px-3 py-4 text-xs text-muted-foreground">
          No diff hunks match this fragment range.
        </div>
      )}
    </div>
  );
}
