import { create } from 'zustand';
import type { Diff, DiffStats, UnifiedPrComment } from 'shared/types';
import type { NormalizedGitHubComment } from '@/shared/hooks/useWorkspaceContext';

// ---------------------------------------------------------------------------
// Zustand store for workspace diff data (diffs, stats, GitHub comments).
// Populated by WorkspaceProvider via setWorkspaceDiffData(); consumers can
// subscribe to individual slices with the exported atomic selectors below.
// ---------------------------------------------------------------------------

const EMPTY_DIFFS: Diff[] = [];
const EMPTY_DIFF_PATHS: Set<string> = new Set();
const EMPTY_DIFF_STATS: DiffStats = {
  files_changed: 0,
  lines_added: 0,
  lines_removed: 0,
};
const EMPTY_COMMENTS: UnifiedPrComment[] = [];
const EMPTY_NORMALIZED: NormalizedGitHubComment[] = [];
const EMPTY_FILES: string[] = [];

const noopGetCommentsForFile = () => EMPTY_NORMALIZED;
const noopGetCommentCountForFile = () => 0;
const noopGetFilesWithComments = () => EMPTY_FILES;
const noopGetFirstCommentLine = () => null;
const noopSetShowGitHubComments = () => {};

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

interface WorkspaceDiffData {
  diffs: Diff[];
  diffPaths: Set<string>;
  diffStats: DiffStats;
  gitHubComments: UnifiedPrComment[];
  isGitHubCommentsLoading: boolean;
  showGitHubComments: boolean;
  setShowGitHubComments: (show: boolean) => void;
  getGitHubCommentsForFile: (filePath: string) => NormalizedGitHubComment[];
  getGitHubCommentCountForFile: (filePath: string) => number;
  getFilesWithGitHubComments: () => string[];
  getFirstCommentLineForFile: (filePath: string) => number | null;
}

interface WorkspaceDiffState extends WorkspaceDiffData {
  /** Batch-update all diff data fields. Called by WorkspaceProvider. */
  setWorkspaceDiffData: (data: WorkspaceDiffData) => void;
  /** Reset to defaults. Called on workspace switch / unmount. */
  clearWorkspaceDiffData: () => void;
}

const DEFAULT_DATA: WorkspaceDiffData = {
  diffs: EMPTY_DIFFS,
  diffPaths: EMPTY_DIFF_PATHS,
  diffStats: EMPTY_DIFF_STATS,
  gitHubComments: EMPTY_COMMENTS,
  isGitHubCommentsLoading: false,
  showGitHubComments: false,
  setShowGitHubComments: noopSetShowGitHubComments,
  getGitHubCommentsForFile: noopGetCommentsForFile,
  getGitHubCommentCountForFile: noopGetCommentCountForFile,
  getFilesWithGitHubComments: noopGetFilesWithComments,
  getFirstCommentLineForFile: noopGetFirstCommentLine,
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useWorkspaceDiffStore = create<WorkspaceDiffState>()((set) => ({
  ...DEFAULT_DATA,

  setWorkspaceDiffData: (data) => set(data),

  clearWorkspaceDiffData: () => set(DEFAULT_DATA),
}));

// ---------------------------------------------------------------------------
// Atomic selectors — each subscribes to a single field to minimise rerenders
// ---------------------------------------------------------------------------

export const useDiffs = () => useWorkspaceDiffStore((s) => s.diffs);

export const useDiffPaths = () => useWorkspaceDiffStore((s) => s.diffPaths);

export const useDiffStats = () => useWorkspaceDiffStore((s) => s.diffStats);

export const useStoreDiffGitHubComments = () =>
  useWorkspaceDiffStore((s) => s.gitHubComments);

export const useIsGitHubCommentsLoading = () =>
  useWorkspaceDiffStore((s) => s.isGitHubCommentsLoading);

export const useShowGitHubComments = () =>
  useWorkspaceDiffStore((s) => s.showGitHubComments);

export const useSetShowGitHubComments = () =>
  useWorkspaceDiffStore((s) => s.setShowGitHubComments);

export const useGetGitHubCommentsForFile = () =>
  useWorkspaceDiffStore((s) => s.getGitHubCommentsForFile);

export const useGetGitHubCommentCountForFile = () =>
  useWorkspaceDiffStore((s) => s.getGitHubCommentCountForFile);

export const useGetFilesWithGitHubComments = () =>
  useWorkspaceDiffStore((s) => s.getFilesWithGitHubComments);

export const useGetFirstCommentLineForFile = () =>
  useWorkspaceDiffStore((s) => s.getFirstCommentLineForFile);
