/**
 * File path utility helpers
 */

/**
 * Check if a file path is a markdown file
 * Supports .md, .markdown, and .mdx extensions (case-insensitive)
 */
export function isMarkdownFile(path: string): boolean {
  return /\.(md|markdown|mdx)$/i.test(path);
}

/**
 * Extract relative path within ~/.claude/ directory from a full path.
 * Returns null if path is not within ~/.claude/.
 *
 * Examples:
 * - "/home/user/.claude/plans/foo.md" -> "plans/foo.md"
 * - "/home/user/project/file.ts" -> null
 * - ".claude/tasks/001.md" -> "tasks/001.md"
 */
export function getClaudeRelativePath(path: string): string | null {
  const match = path.match(/\.claude\/(.+)$/);
  return match ? match[1] : null;
}

/**
 * Result of file preview routing decision.
 * Either contains an attemptId (worktree file) or a relativePath (Claude home file).
 */
export type FilePreviewRouting =
  | { path: string; attemptId: string; relativePath?: undefined }
  | { path: string; relativePath: string; attemptId?: undefined };

/**
 * Options for determining file preview routing.
 */
export interface FilePreviewRoutingOptions {
  /** Full file path */
  path: string;
  /** Optional attempt ID for worktree context */
  attemptId?: string;
}

/**
 * Determine the correct routing for a file preview.
 *
 * IMPORTANT: This function implements the correct routing priority:
 * 1. attemptId takes precedence (worktree files, including .claude/ paths within worktrees)
 * 2. claudeRelativePath is fallback (Claude home directory files)
 *
 * This priority is critical because worktree files can have .claude/ in their path
 * (e.g., .claude/tasks/001.md) and without this priority they would be incorrectly
 * routed to the Claude home directory API.
 *
 * @param options - The routing options including path and optional attemptId
 * @returns FilePreviewRouting object for openFile(), or null if file cannot be routed
 */
export function getFilePreviewRouting(
  options: FilePreviewRoutingOptions
): FilePreviewRouting | null {
  const { path, attemptId } = options;
  const claudeRelativePath = getClaudeRelativePath(path);
  const isViewable = claudeRelativePath !== null || isMarkdownFile(path);

  // Priority 1: attemptId takes precedence for worktree files.
  // Exception: absolute paths to ~/.claude/ are home-dir files, not worktree files —
  // an absolute path can never be inside a worktree, so route via relativePath instead.
  const isAbsoluteClaudePath = path.startsWith('/') && claudeRelativePath !== null;
  if (attemptId && !isAbsoluteClaudePath) {
    return { path, attemptId };
  }

  // Priority 2: Claude home directory files (no attemptId)
  if (claudeRelativePath) {
    return { path, relativePath: claudeRelativePath };
  }

  // No routing context available
  if (isViewable) {
    console.warn(
      `[FilePreviewRouting] Unable to route file preview: neither attemptId nor claudeRelativePath available for path: ${path}`
    );
  }
  return null;
}

/**
 * Check if a file should show a view button in conversation logs.
 * Returns true for .claude/ files and markdown files.
 */
export function shouldShowViewButton(path: string): boolean {
  return getClaudeRelativePath(path) !== null || isMarkdownFile(path);
}
