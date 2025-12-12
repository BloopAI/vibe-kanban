import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, Navigate } from "react-router-dom";
import { DiffView, DiffModeEnum } from "@git-diff-view/react";
import "@git-diff-view/react/styles/diff-view.css";
import "../styles/diff-overrides.css";
import { getReview, getFileContent } from "../lib/review-api";
import type { ReviewResult, ReviewComment } from "../types/review";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import {
  parseUnifiedDiff,
  getFileDiff,
  buildFullFileDiff,
  synthesizeFragmentDiff,
  type ParsedFileDiff,
} from "../lib/diff-parser";

const ALLOWED_REVIEW_ID = "154e7470-de47-4266-9e15-c1bf4ff7a0de";

const HARDCODED_DIFF = `diff --git a/crates/db/src/models/execution_process.rs b/crates/db/src/models/execution_process.rs
index d569437bd..a4962b7ee 100644
--- a/crates/db/src/models/execution_process.rs
+++ b/crates/db/src/models/execution_process.rs
@@ -414,13 +414,18 @@ impl ExecutionProcess {
     }

     /// Create a new execution process
+    ///
+    /// Note: We intentionally avoid using a transaction here. SQLite update
+    /// hooks fire during transactions (before commit), and the hook spawns an
+    /// async task that queries \`find_by_rowid\` on a different connection.
+    /// If we used a transaction, that query would not see the uncommitted row,
+    /// causing the WebSocket event to be lost.
     pub async fn create(
         pool: &SqlitePool,
         data: &CreateExecutionProcess,
         process_id: Uuid,
         repo_states: &[CreateExecutionProcessRepoState],
     ) -> Result<Self, sqlx::Error> {
-        let mut tx = pool.begin().await?;
         let now = Utc::now();
         let executor_action_json = sqlx::types::Json(&data.executor_action);

@@ -440,12 +445,10 @@ impl ExecutionProcess {
             now,
             now
         )
-        .execute(&mut *tx)
+        .execute(pool)
         .await?;

-        ExecutionProcessRepoState::create_many(&mut tx, process_id, repo_states).await?;
-
-        tx.commit().await?;
+        ExecutionProcessRepoState::create_many(pool, process_id, repo_states).await?;

         Self::find_by_id(pool, process_id)
             .await?
diff --git a/crates/db/src/models/execution_process_repo_state.rs b/crates/db/src/models/execution_process_repo_state.rs
index 0d392cd08..5952979ea 100644
--- a/crates/db/src/models/execution_process_repo_state.rs
+++ b/crates/db/src/models/execution_process_repo_state.rs
@@ -1,6 +1,6 @@
 use chrono::{DateTime, Utc};
 use serde::{Deserialize, Serialize};
-use sqlx::{FromRow, Sqlite, SqlitePool, Transaction};
+use sqlx::{FromRow, SqlitePool};
 use ts_rs::TS;
 use uuid::Uuid;

@@ -28,7 +28,7 @@ pub struct CreateExecutionProcessRepoState {

 impl ExecutionProcessRepoState {
     pub async fn create_many(
-        tx: &mut Transaction<'_, Sqlite>,
+        pool: &SqlitePool,
         execution_process_id: Uuid,
         entries: &[CreateExecutionProcessRepoState],
     ) -> Result<(), sqlx::Error> {
@@ -60,7 +60,7 @@ impl ExecutionProcessRepoState {
                 now,
                 now
             )
-            .execute(&mut **tx)
+            .execute(pool)
             .await?;
         }
`;

const EXT_TO_LANG: Record<string, string> = {
  rs: "rust",
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  py: "python",
  go: "go",
};

function getLanguageFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  return EXT_TO_LANG[ext] || "plaintext";
}

type FileCache = Map<string, string>;

export default function DiffReviewPage() {
  const { id } = useParams<{ id: string }>();
  const [review, setReview] = useState<ReviewResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fileCache, setFileCache] = useState<FileCache>(new Map());

  const parsedDiffs = useMemo(() => parseUnifiedDiff(HARDCODED_DIFF), []);

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

      try {
        const content = await getFileContent(id, hash);
        setFileCache((prev) => new Map(prev).set(filePath, content));
      } catch (err) {
        console.error(`Failed to fetch file ${filePath}:`, err);
      }
    },
    [id, review, pathToHash, fileCache]
  );

  useEffect(() => {
    if (!id || id !== ALLOWED_REVIEW_ID) return;

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

  if (id !== ALLOWED_REVIEW_ID) {
    return <Navigate to={`/review/${id}`} replace />;
  }

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
          <h1 className="text-lg font-semibold text-foreground mb-2">
            {error || "Review not found"}
          </h1>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="border-b px-4 py-5">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded text-xs font-medium">
              DIFF PROTOTYPE
            </span>
          </div>
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Review Summary
          </h2>
          <MarkdownRenderer content={review.summary} className="text-sm" />
        </div>
      </div>

      <div className="px-4 pb-4 flex-1">
        <div className="max-w-6xl mx-auto divide-y">
          {review.comments.map((comment, idx) => (
            <DiffCommentRow
              key={idx}
              index={idx + 1}
              comment={comment}
              parsedDiffs={parsedDiffs}
              fileCache={fileCache}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

interface DiffCommentRowProps {
  index: number;
  comment: ReviewComment;
  parsedDiffs: ParsedFileDiff[];
  fileCache: FileCache;
}

function DiffCommentRow({ index, comment, parsedDiffs, fileCache }: DiffCommentRowProps) {
  const hasComment = comment.comment && comment.comment.trim().length > 0;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-6 py-6">
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
}

function DiffFragmentCard({
  file,
  startLine,
  endLine,
  message,
  parsedDiffs,
  fileContent,
}: DiffFragmentCardProps) {
  const [viewMode, setViewMode] = useState<"fragment" | "file">("fragment");

  const fileDiff = useMemo(() => getFileDiff(parsedDiffs, file), [parsedDiffs, file]);
  const lang = getLanguageFromPath(file);

  const diffData = useMemo(() => {
    if (!fileDiff) return null;

    if (viewMode === "file") {
      const diffString = buildFullFileDiff(fileDiff);
      if (!diffString) return null;
      return {
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
      hunks: [diffString],
      oldFile: { fileName: file, fileLang: lang },
      newFile: { fileName: file, fileLang: lang },
    };
  }, [fileDiff, file, lang, startLine, endLine, viewMode, fileContent]);

  if (!fileDiff) {
    return (
      <div className="border rounded bg-muted/40 p-3">
        <div className="text-xs text-muted-foreground">
          No diff available for {file}
        </div>
      </div>
    );
  }

  return (
    <div className="border rounded bg-muted/40 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/60">
        <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
          <span className="font-mono truncate">{file}</span>
          <span className="shrink-0">
            Lines {startLine}
            {endLine !== startLine && `–${endLine}`}
          </span>
        </div>
        {message && (
          <div className="flex-1 text-xs text-muted-foreground truncate text-right">
            {message}
          </div>
        )}
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

      {diffData ? (
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
      ) : (
        <div className="px-3 py-4 text-xs text-muted-foreground">
          No diff hunks match this fragment range.
        </div>
      )}
    </div>
  );
}
