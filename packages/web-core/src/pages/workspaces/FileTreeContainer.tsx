import { useState, useMemo, useCallback, useEffect, useRef } from 'react';

import { FileTree } from '@vibe/ui/components/FileTree';
import {
  buildFileTree,
  filterFileTree,
  getExpandedPathsForSearch,
  getAllFolderPaths,
  sortDiffs,
} from '@/shared/lib/fileTreeUtils';
import { usePersistedCollapsedPaths } from '@/shared/stores/useUiPreferencesStore';
import { useFileInView } from '@/shared/stores/useFileInViewStore';
import {
  useShowGitHubComments,
  useSetShowGitHubComments,
  useGetGitHubCommentCountForFile,
  useGetFilesWithGitHubComments,
  useGetFirstCommentLineForFile,
  useIsGitHubCommentsLoading,
} from '@/shared/stores/useWorkspaceDiffStore';
import { useChangesView } from '@/shared/hooks/useChangesView';
import { getFileIcon } from '@/shared/lib/fileTypeIcon';
import { useTheme } from '@/shared/hooks/useTheme';
import { getActualTheme } from '@/shared/lib/theme';
import type { Diff } from 'shared/types';

interface FileTreeContainerProps {
  workspaceId: string;
  diffs: Diff[];
  className: string;
}

export function FileTreeContainer({
  workspaceId,
  diffs,
  className,
}: FileTreeContainerProps) {
  const { theme } = useTheme();
  const actualTheme = getActualTheme(theme);

  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedPaths, setCollapsedPaths] =
    usePersistedCollapsedPaths(workspaceId);
  const showGitHubComments = useShowGitHubComments();
  const setShowGitHubComments = useSetShowGitHubComments();
  const getGitHubCommentCountForFile = useGetGitHubCommentCountForFile();
  const getFilesWithGitHubComments = useGetFilesWithGitHubComments();
  const getFirstCommentLineForFile = useGetFirstCommentLineForFile();
  const isGitHubCommentsLoading = useIsGitHubCommentsLoading();

  const { selectedFilePath, scrollToFile } = useChangesView();
  const fileInView = useFileInView();
  const activeFilePath = fileInView ?? selectedFilePath;
  const treeScrollRef = useRef<HTMLDivElement | null>(null);
  const treeScrollCallbackRef = useCallback((el: HTMLDivElement | null) => {
    treeScrollRef.current = el;
  }, []);

  useEffect(() => {
    if (!activeFilePath || !treeScrollRef.current) return;
    const container = treeScrollRef.current;
    const selector = `[data-tree-path="${CSS.escape(activeFilePath)}"]`;
    const node = container.querySelector(selector);
    if (!(node instanceof HTMLElement)) return;

    const scrollNodeIntoView = () => {
      const cRect = container.getBoundingClientRect();
      const nRect = node.getBoundingClientRect();
      if (nRect.top < cRect.top) {
        container.scrollTop += nRect.top - cRect.top - 4;
      } else if (nRect.bottom > cRect.bottom) {
        container.scrollTop += nRect.bottom - cRect.bottom + 4;
      }
    };

    scrollNodeIntoView();
    // Retry once after rAF — content-visibility reflow may shift positions
    const rafId = requestAnimationFrame(scrollNodeIntoView);
    return () => cancelAnimationFrame(rafId);
  }, [activeFilePath]);

  const fullTree = useMemo(() => buildFileTree(diffs), [diffs]);

  // Get all folder paths for expand all functionality
  const allFolderPaths = useMemo(() => getAllFolderPaths(fullTree), [fullTree]);

  // All folders are expanded when none are in the collapsed set
  const isAllExpanded = collapsedPaths.size === 0;

  // Filter tree based on search
  const filteredTree = useMemo(
    () => filterFileTree(fullTree, searchQuery),
    [fullTree, searchQuery]
  );

  // Auto-expand folders when searching (remove from collapsed set)
  const collapsedPathsRef = useRef(collapsedPaths);
  collapsedPathsRef.current = collapsedPaths;

  useEffect(() => {
    if (searchQuery) {
      const pathsToExpand = getExpandedPathsForSearch(fullTree, searchQuery);
      const next = new Set(collapsedPathsRef.current);
      pathsToExpand.forEach((p) => next.delete(p));
      setCollapsedPaths(next);
    }
  }, [searchQuery, fullTree, setCollapsedPaths]);

  const handleToggleExpand = useCallback(
    (path: string) => {
      setCollapsedPaths((prev) => {
        const next = new Set(prev);
        if (next.has(path)) {
          next.delete(path);
        } else {
          next.add(path);
        }
        return next;
      });
    },
    [setCollapsedPaths]
  );

  const handleToggleExpandAll = useCallback(() => {
    if (isAllExpanded) {
      setCollapsedPaths(new Set(allFolderPaths)); // collapse all
    } else {
      setCollapsedPaths(new Set()); // expand all
    }
  }, [isAllExpanded, allFolderPaths, setCollapsedPaths]);

  const handleSelectFile = useCallback(
    (path: string) => {
      const diff = diffs.find((d) => d.newPath === path || d.oldPath === path);

      if (diff) {
        const targetPath = diff.newPath || diff.oldPath || path;
        scrollToFile(targetPath);
      }
    },
    [diffs, scrollToFile]
  );

  // Get list of diff paths that have GitHub comments, sorted to match visual order
  const filesWithComments = useMemo(() => {
    const ghFiles = getFilesWithGitHubComments();
    // Sort diffs first to match visual order, then filter to those with comments
    return sortDiffs(diffs)
      .map((d) => d.newPath || d.oldPath || '')
      .filter((diffPath) =>
        ghFiles.some(
          (ghPath) => diffPath === ghPath || diffPath.endsWith('/' + ghPath)
        )
      );
  }, [getFilesWithGitHubComments, diffs]);

  // Navigate between files with GitHub comments
  const handleNavigateComments = useCallback(
    (direction: 'prev' | 'next') => {
      if (filesWithComments.length === 0) return;

      const currentIndex = activeFilePath
        ? filesWithComments.indexOf(activeFilePath)
        : -1;
      let nextIndex: number;

      if (direction === 'next') {
        nextIndex =
          currentIndex < filesWithComments.length - 1 ? currentIndex + 1 : 0;
      } else {
        nextIndex =
          currentIndex > 0 ? currentIndex - 1 : filesWithComments.length - 1;
      }

      const targetPath = filesWithComments[nextIndex];
      const lineNumber = getFirstCommentLineForFile(targetPath);

      scrollToFile(targetPath, lineNumber ?? undefined);
    },
    [
      filesWithComments,
      activeFilePath,
      getFirstCommentLineForFile,
      scrollToFile,
    ]
  );

  const renderFileIcon = useCallback(
    (fileName: string) => {
      const FileIcon = getFileIcon(fileName, actualTheme);
      return FileIcon ? <FileIcon size={14} /> : null;
    },
    [actualTheme]
  );

  return (
    <FileTree
      nodes={filteredTree}
      collapsedPaths={collapsedPaths}
      onToggleExpand={handleToggleExpand}
      selectedPath={activeFilePath}
      onSelectFile={handleSelectFile}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      renderFileIcon={renderFileIcon}
      isAllExpanded={isAllExpanded}
      onToggleExpandAll={handleToggleExpandAll}
      className={className}
      scrollContainerRef={treeScrollCallbackRef}
      showGitHubComments={showGitHubComments}
      onToggleGitHubComments={setShowGitHubComments}
      getGitHubCommentCountForFile={getGitHubCommentCountForFile}
      isGitHubCommentsLoading={isGitHubCommentsLoading}
      onNavigateComments={handleNavigateComments}
      hasFilesWithComments={filesWithComments.length > 0}
    />
  );
}
