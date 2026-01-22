import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { FileTree } from '../views/FileTree';
import {
  buildFileTree,
  filterFileTree,
  getExpandedPathsForSearch,
  getAllFolderPaths,
  sortDiffs,
} from '@/utils/fileTreeUtils';
import { usePersistedCollapsedPaths } from '@/stores/useUiPreferencesStore';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { useChangesView } from '@/contexts/ChangesViewContext';
import type { Diff } from 'shared/types';

interface FileTreeContainerProps {
  workspaceId: string;
  diffs: Diff[];
  onSelectFile: (path: string, diff: Diff) => void;
  className: string;
}

export function FileTreeContainer({
  workspaceId,
  diffs,
  onSelectFile,
  className,
}: FileTreeContainerProps) {
  const { fileInView, scrollToFile } = useChangesView();
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedPaths, setCollapsedPaths] =
    usePersistedCollapsedPaths(workspaceId);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const {
    showGitHubComments,
    setShowGitHubComments,
    getGitHubCommentCountForFile,
    getFilesWithGitHubComments,
    getFirstCommentLineForFile,
    isGitHubCommentsLoading,
  } = useWorkspaceContext();

  useEffect(() => {
    if (fileInView != null) {
      setSelectedPath(fileInView);
      const el = nodeRefs.current.get(fileInView);
      if (el) {
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [fileInView]);

  const handleNodeRef = useCallback(
    (path: string, el: HTMLDivElement | null) => {
      if (el) {
        nodeRefs.current.set(path, el);
      } else {
        nodeRefs.current.delete(path);
      }
    },
    []
  );

  const fullTree = useMemo(() => buildFileTree(diffs), [diffs]);
  const allFolderPaths = useMemo(() => getAllFolderPaths(fullTree), [fullTree]);
  const isAllExpanded = collapsedPaths.size === 0;

  const filteredTree = useMemo(
    () => filterFileTree(fullTree, searchQuery),
    [fullTree, searchQuery]
  );

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
      const next = new Set(collapsedPaths);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      setCollapsedPaths(next);
    },
    [collapsedPaths, setCollapsedPaths]
  );

  const handleToggleExpandAll = useCallback(() => {
    if (isAllExpanded) {
      setCollapsedPaths(new Set(allFolderPaths));
    } else {
      setCollapsedPaths(new Set());
    }
  }, [isAllExpanded, allFolderPaths, setCollapsedPaths]);

  const handleSelectFile = useCallback(
    (path: string) => {
      setSelectedPath(path);
      scrollToFile(path);

      const diff = diffs.find((d) => d.newPath === path || d.oldPath === path);
      if (diff) {
        onSelectFile(path, diff);
      }
    },
    [diffs, onSelectFile, scrollToFile]
  );

  const filesWithComments = useMemo(() => {
    const ghFiles = getFilesWithGitHubComments();
    return sortDiffs(diffs)
      .map((d) => d.newPath || d.oldPath || '')
      .filter((diffPath) =>
        ghFiles.some(
          (ghPath) => diffPath === ghPath || diffPath.endsWith('/' + ghPath)
        )
      );
  }, [getFilesWithGitHubComments, diffs]);

  const handleNavigateComments = useCallback(
    (direction: 'prev' | 'next') => {
      if (filesWithComments.length === 0) return;

      const currentIndex = selectedPath
        ? filesWithComments.indexOf(selectedPath)
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

      setSelectedPath(targetPath);
      scrollToFile(targetPath, lineNumber ?? undefined);
    },
    [filesWithComments, selectedPath, getFirstCommentLineForFile, scrollToFile]
  );

  return (
    <FileTree
      nodes={filteredTree}
      collapsedPaths={collapsedPaths}
      onToggleExpand={handleToggleExpand}
      selectedPath={selectedPath}
      onSelectFile={handleSelectFile}
      onNodeRef={handleNodeRef}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      isAllExpanded={isAllExpanded}
      onToggleExpandAll={handleToggleExpandAll}
      className={className}
      showGitHubComments={showGitHubComments}
      onToggleGitHubComments={setShowGitHubComments}
      getGitHubCommentCountForFile={getGitHubCommentCountForFile}
      isGitHubCommentsLoading={isGitHubCommentsLoading}
      onNavigateComments={handleNavigateComments}
      hasFilesWithComments={filesWithComments.length > 0}
    />
  );
}
