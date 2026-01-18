import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { FileTree } from '../views/FileTree';
import {
  buildFileTree,
  filterFileTree,
  getExpandedPathsForSearch,
  getAllFolderPaths,
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
  const { fileInView } = useChangesView();
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedPaths, setCollapsedPaths] =
    usePersistedCollapsedPaths(workspaceId);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Get GitHub comments state from workspace context
  const {
    showGitHubComments,
    setShowGitHubComments,
    getGitHubCommentCountForFile,
    isGitHubCommentsLoading,
  } = useWorkspaceContext();

  // Sync selectedPath with fileInView from context and scroll into view
  useEffect(() => {
    if (fileInView !== undefined) {
      setSelectedPath(fileInView);
      // Scroll the selected node into view if needed
      if (fileInView) {
        const el = nodeRefs.current.get(fileInView);
        if (el) {
          el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
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

  // Build tree from diffs
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
      const next = new Set(collapsedPaths);
      if (next.has(path)) {
        next.delete(path); // was collapsed, now expand
      } else {
        next.add(path); // was expanded, now collapse
      }
      setCollapsedPaths(next);
    },
    [collapsedPaths, setCollapsedPaths]
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
      setSelectedPath(path);
      // Find the diff for this path
      const diff = diffs.find((d) => d.newPath === path || d.oldPath === path);
      if (diff) {
        onSelectFile(path, diff);
      }
    },
    [diffs, onSelectFile]
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
    />
  );
}
