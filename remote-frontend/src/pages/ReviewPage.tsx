import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { DiffView, DiffModeEnum } from "@git-diff-view/react";
import "@git-diff-view/react/styles/diff-view.css";
import "../styles/diff-overrides.css";
import {
  getReview,
  getFileContent,
  getDiff,
  getReviewMetadata,
  type ReviewMetadata,
} from "../api";
import type { ReviewResult, ReviewComment } from "../types/review";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import {
  parseUnifiedDiff,
  getFileDiff,
  synthesizeFragmentDiff,
  type ParsedFileDiff,
} from "../lib/diff-parser";
import { getHighlightLanguageFromPath } from "../lib/extToLanguage";
import { CodeFragmentCard } from "../components/CodeFragmentCard";
import { cn } from "../lib/utils";

const DIFF_VIEW_MODE_KEY = "diff-view-mode";

function diffHasChanges(diffString: string): boolean {
  return diffString.split("\n").some((line) => {
    if (!line) return false;
    if (
      line.startsWith("--- ") ||
      line.startsWith("+++ ") ||
      line.startsWith("@@")
    )
      return false;
    return line[0] === "+" || line[0] === "-";
  });
}

type FileCache = Map<string, string>;

export default function ReviewPage() {
  const { id } = useParams<{ id: string }>();
  const [review, setReview] = useState<ReviewResult | null>(null);
  const [metadata, setMetadata] = useState<ReviewMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fileCache, setFileCache] = useState<FileCache>(new Map());
  const [loadingFiles, setLoadingFiles] = useState<Set<string>>(new Set());
  const [scrollProgress, setScrollProgress] = useState(0);
  const [diffText, setDiffText] = useState<string>("");
  const [diffViewMode, setDiffViewMode] = useState<DiffModeEnum>(() => {
    const saved = localStorage.getItem(DIFF_VIEW_MODE_KEY);
    return saved === "split" ? DiffModeEnum.Split : DiffModeEnum.Unified;
  });
  const fetchingFiles = useRef<Set<string>>(new Set());

  const parsedDiffs = useMemo(() => parseUnifiedDiff(diffText), [diffText]);

  const handleViewModeChange = useCallback((mode: DiffModeEnum) => {
    setDiffViewMode(mode);
    localStorage.setItem(
      DIFF_VIEW_MODE_KEY,
      mode === DiffModeEnum.Split ? "split" : "unified",
    );
  }, []);

  useEffect(() => {
    if (!id) return;
    // Skip refetch if we already have data for this review (e.g., during HMR)
    if (review) return;

    setLoading(true);
    setError(null);

    Promise.all([getReview(id), getDiff(id), getReviewMetadata(id)])
      .then(([reviewData, diffData, metadataData]) => {
        setReview(reviewData);
        setDiffText(diffData);
        setMetadata(metadataData);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Failed to load review");
        setLoading(false);
      });
  }, [id, review]);

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
      if (fetchingFiles.current.has(filePath)) return;

      fetchingFiles.current.add(filePath);
      setLoadingFiles((prev) => new Set(prev).add(filePath));

      try {
        const content = await getFileContent(id, hash);
        setFileCache((prev) => new Map(prev).set(filePath, content));
      } catch (err) {
        console.error(`Failed to fetch file ${filePath}:`, err);
      } finally {
        fetchingFiles.current.delete(filePath);
        setLoadingFiles((prev) => {
          const next = new Set(prev);
          next.delete(filePath);
          return next;
        });
      }
    },
    [id, review, pathToHash],
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
      fetchFile(filePath);
    }
  }, [review, fetchFile]);

  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight =
        document.documentElement.scrollHeight - window.innerHeight;
      const progress = docHeight > 0 ? Math.min(1, scrollTop / docHeight) : 0;
      setScrollProgress(progress);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Parse PR metadata from the GitHub URL
  const prMetadata = useMemo(() => {
    if (!metadata) {
      return { org: "", repo: "", number: 0, title: "" };
    }
    // Parse gh_pr_url: https://github.com/owner/repo/pull/123
    const match = metadata.gh_pr_url.match(
      /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/,
    );
    if (match) {
      return {
        org: match[1],
        repo: match[2],
        number: parseInt(match[3], 10),
        title: metadata.pr_title,
      };
    }
    return { org: "", repo: "", number: 0, title: metadata.pr_title };
  }, [metadata]);

  useEffect(() => {
    if (review && prMetadata.title) {
      document.title = `Review: ${prMetadata.title} · ${prMetadata.org}/${prMetadata.repo}#${prMetadata.number}`;
    }
  }, [review, prMetadata]);

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

  const prUrl =
    metadata?.gh_pr_url ||
    `https://github.com/${prMetadata.org}/${prMetadata.repo}/pull/${prMetadata.number}`;
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

      {/* Header - Two Column Layout - Full Height */}
      <div className="min-h-screen border-b px-4 py-5 mt-1 flex flex-col justify-center items-center">
        <div className="w-full max-w-2xl p-8 space-y-40">
          <div className="space-y-4">
            <div className="flex gap-2 items-center text-secondary-foreground">
              <svg
                className="h-4 w-4 shrink-0"
                fill="currentColor"
                viewBox="0 0 16 16"
              >
                <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z" />
              </svg>
              <h2>
                <a
                  href={prUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                >
                  {prMetadata.org}/{prMetadata.repo}
                </a>
              </h2>
            </div>
            <div className="border-b pb-4">
              <h1 className="text-2xl">
                {prMetadata.title} (
                <a
                  href={prUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                >
                  #{prMetadata.number}
                </a>
                )
              </h1>
            </div>
            <div>
              <MarkdownRenderer
                content={review.summary}
                className="text-base text-secondary-foreground"
              />
            </div>
          </div>
          <div>
            <div className="bg-muted p-4 rounded-sm space-y-2 border">
              <a href="https://review.fast" target="_blank">
                <img
                  src="/review_fast_logo_dark.svg"
                  alt="Logo"
                  className="w-32"
                />
              </a>
              <p className="text-base text-secondary-foreground">
                To make this PR easier to understand and review, an AI agent has
                written a <i>review story</i>. The changes are presented in a
                clear, logical order, with concise, AI-generated comments that
                explain context and highlight what matters.{" "}
                <a
                  href="https://review.fast"
                  className="text-primary-foreground"
                  target="_blank"
                >
                  Learn more.
                </a>
              </p>
              <p className="text-base">Please scroll to begin</p>
            </div>
          </div>
        </div>
      </div>

      {/* Comments List - Two Column Grid Layout */}
      {review.comments.map((comment, idx) => (
        <CommentStoryRow
          key={idx}
          index={idx + 1}
          totalComments={review.comments.length}
          comment={comment}
          fileCache={fileCache}
          loadingFiles={loadingFiles}
          parsedDiffs={parsedDiffs}
          hasDiff={hasDiff}
          diffViewMode={diffViewMode}
        />
      ))}

      {/* Footer - Promotional */}
      <div className="border-t px-4 py-6 bg-muted/30 pb-16">
        <div className="text-center">
          <p className="text-sm text-muted-foreground mb-2">
            Generate AI-powered code reviews for your pull requests
          </p>
          <code className="inline-block bg-secondary px-3 py-2 rounded-md text-sm font-mono text-foreground">
            npx vibe-kanban review https://github.com/owner/repo/pull/123
          </code>
        </div>
      </div>

      {/* Fixed Footer Toolbar */}
      <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur border-t z-50 px-4 py-2 opacity-50 hover:opacity-100 transition-opacity">
        <div className="flex justify-between items-center">
          {/* Left: Logo */}
          <a
            href="https://review.fast"
            target="_blank"
            rel="noopener noreferrer"
          >
            <img
              src="/review_fast_logo_dark.svg"
              alt="review.fast"
              className="h-3"
            />
          </a>

          {/* Right: View Toggle */}
          <div className="flex items-center gap-1">
            <span className="text-sm text-muted-foreground mr-2">View:</span>
            <button
              onClick={() => handleViewModeChange(DiffModeEnum.Unified)}
              className={cn(
                "px-3 py-1 text-sm rounded-l border",
                diffViewMode === DiffModeEnum.Unified
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80",
              )}
            >
              Unified
            </button>
            <button
              onClick={() => handleViewModeChange(DiffModeEnum.Split)}
              className={cn(
                "px-3 py-1 text-sm rounded-r border-t border-r border-b",
                diffViewMode === DiffModeEnum.Split
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80",
              )}
            >
              Split
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface CommentStoryRowProps {
  index: number;
  totalComments: number;
  comment: ReviewComment;
  fileCache: FileCache;
  loadingFiles: Set<string>;
  parsedDiffs: ParsedFileDiff[];
  hasDiff: boolean;
  diffViewMode: DiffModeEnum;
}

function CommentStoryRow({
  index,
  totalComments,
  comment,
  fileCache,
  loadingFiles,
  parsedDiffs,
  hasDiff,
  diffViewMode,
}: CommentStoryRowProps) {
  const hasComment = comment.comment && comment.comment.trim().length > 0;

  return (
    <div className="min-h-screen flex flex-row justify-center px-8 2xl:px-[10vw] space-x-8 2xl:space-x-[5vw]">
      <div className="flex-1 flex  w-1/2 2xl:w-1/3">
        <div className="h-screen sticky top-0 flex items-center">
          <div className="flex space-x-4">
            <span className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-muted shrink-0">
              <div className="inline-flex items-baseline text-primary-foreground text-xl font-bold">
                {index}
                <span className="text-sm text-muted-foreground font-medium">
                  /{totalComments}
                </span>
              </div>
            </span>
            {hasComment ? (
              <MarkdownRenderer
                content={comment.comment}
                className="text-lg min-w-0 text-secondary-foreground"
              />
            ) : (
              <span className="text-sm text-muted-foreground italic">
                (No comment text)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Right Column - Code Fragments */}
      <div className="pt-[100vh] pb-[50vh] w-1/2 2xl:w-2/3 space-y-[50vh]">
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
              diffViewMode={diffViewMode}
            />
          ))
        ) : (
          <div className="text-sm text-muted-foreground">
            No code fragments for this comment.
          </div>
        )}
      </div>
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
  diffViewMode: DiffModeEnum;
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
  diffViewMode,
}: DiffFragmentCardProps) {
  const fileDiff = useMemo(
    () => getFileDiff(parsedDiffs, file),
    [parsedDiffs, file],
  );
  const lang = getHighlightLanguageFromPath(file);

  const diffData = useMemo(() => {
    if (!fileDiff) return null;

    if (!fileContent) return null;

    const diffString = synthesizeFragmentDiff(
      fileDiff,
      fileContent,
      startLine,
      endLine,
      3,
    );

    if (!diffString) return null;

    return {
      hasChanges: diffHasChanges(diffString),
      hunks: [diffString],
      oldFile: { fileName: file, fileLang: lang },
      newFile: { fileName: file, fileLang: lang },
    };
  }, [fileDiff, file, lang, startLine, endLine, fileContent]);

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
            <svg
              className="h-3.5 w-3.5 shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
              />
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
    <div className="flex flex-col space-y-4">
      <div className="flex">
        <div className="font-mono bg-muted py-1 px-2 rounded-sm border text-secondary-foreground break-words max-w-full">
          {file}
        </div>
      </div>
      {message && (
        <div>
          <span>
            <MarkdownRenderer content={message} />
          </span>
        </div>
      )}
      <div className="border rounded bg-muted/40 overflow-hidden">
        {diffData ? (
          diffData.hasChanges ? (
            <div className="diff-view-container">
              <DiffView
                data={diffData}
                diffViewMode={diffViewMode}
                diffViewTheme="dark"
                diffViewHighlight
                diffViewFontSize={12}
                diffViewWrap={false}
              />
            </div>
          ) : fileContent ? (
            <CodeFragmentCard
              fragment={{
                file,
                start_line: startLine,
                end_line: endLine,
                message: "",
              }}
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
            <span className="text-xs text-muted-foreground">
              Loading file content...
            </span>
          </div>
        ) : (
          <div className="px-3 py-4 text-xs text-muted-foreground">
            No diff hunks match this fragment range.
          </div>
        )}
      </div>
    </div>
  );
}
