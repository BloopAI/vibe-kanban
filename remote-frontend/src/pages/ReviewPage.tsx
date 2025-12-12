import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { getReview, getFileContent } from "../lib/review-api";
import type { ReviewResult, ReviewComment } from "../types/review";
import { CodeFragmentCard } from "../components/CodeFragmentCard";
import { MarkdownRenderer } from "../components/MarkdownRenderer";

type FileCache = Map<string, string>;

export default function ReviewPage() {
  const { id } = useParams<{ id: string }>();
  const [review, setReview] = useState<ReviewResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fileCache, setFileCache] = useState<FileCache>(new Map());
  const [loadingFiles, setLoadingFiles] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!id) return;

    setLoading(true);
    setError(null);

    getReview(id)
      .then((data) => {
        setReview(data);
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

  // Prefetch all files on load
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

  // Dummy metadata - will come from API later
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

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header - Two Column Layout */}
      <div className="border-b px-4 py-5">
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
}

function CommentStoryRow({
  index,
  comment,
  fileCache,
  loadingFiles,
}: CommentStoryRowProps) {
  const hasComment = comment.comment && comment.comment.trim().length > 0;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-6 py-6">
      {/* Left Column - Comment */}
      <div className="sticky top-4 self-start max-h-[calc(100vh-2rem)] overflow-y-auto min-w-0">
        <div className="flex items-start gap-3">
          <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-medium shrink-0">
            {index}
          </span>
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
      </div>

      {/* Right Column - Code Fragments */}
      <div className="space-y-3 min-w-0 overflow-x-auto">
        {comment.fragments.length > 0 ? (
          comment.fragments.map((fragment, fIdx) => (
            <CodeFragmentCard
              key={`${fragment.file}:${fragment.start_line}-${fragment.end_line}:${fIdx}`}
              fragment={fragment}
              fileContent={fileCache.get(fragment.file)}
              isLoading={loadingFiles.has(fragment.file)}
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
