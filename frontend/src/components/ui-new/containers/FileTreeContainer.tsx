import { useState, useMemo, useCallback, useEffect } from 'react';
import { FileTree } from '../views/FileTree';
import {
  buildFileTree,
  filterFileTree,
  getExpandedPathsForSearch,
  getAllFolderPaths,
} from '@/utils/fileTreeUtils';
import type { Diff } from 'shared/types';

interface FileTreeContainerProps {
  diffs: Diff[];
  onSelectFile?: (path: string, diff: Diff) => void;
  className?: string;
}

export function FileTreeContainer({
  diffs,
  onSelectFile,
  className,
}: FileTreeContainerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedPaths, setExpandedPaths] = useState<Set<string> | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  // Build tree from diffs
  const fullTree = useMemo(() => buildFileTree(diffs), [diffs]);

  // Get all folder paths for expand all functionality
  const allFolderPaths = useMemo(() => getAllFolderPaths(fullTree), [fullTree]);

  // Initialize with all folders expanded on first render
  useEffect(() => {
    if (expandedPaths === null && allFolderPaths.length > 0) {
      setExpandedPaths(new Set(allFolderPaths));
    }
  }, [allFolderPaths, expandedPaths]);

  // Use actual expanded paths or empty set while initializing
  const effectiveExpandedPaths = useMemo(
    () => expandedPaths ?? new Set<string>(),
    [expandedPaths]
  );

  // Check if all folders are expanded
  const isAllExpanded = useMemo(
    () =>
      allFolderPaths.length > 0 &&
      allFolderPaths.every((p) => effectiveExpandedPaths.has(p)),
    [allFolderPaths, effectiveExpandedPaths]
  );

  // Filter tree based on search
  const filteredTree = useMemo(
    () => filterFileTree(fullTree, searchQuery),
    [fullTree, searchQuery]
  );

  // Auto-expand folders when searching (merge with existing expanded paths)
  useEffect(() => {
    if (searchQuery) {
      const pathsToExpand = getExpandedPathsForSearch(fullTree, searchQuery);
      setExpandedPaths((prev) => new Set([...(prev ?? []), ...pathsToExpand]));
    }
  }, [searchQuery, fullTree]);

  const handleToggleExpand = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const handleToggleExpandAll = useCallback(() => {
    if (isAllExpanded) {
      setExpandedPaths(new Set());
    } else {
      setExpandedPaths(new Set(allFolderPaths));
    }
  }, [isAllExpanded, allFolderPaths]);

  const handleSelectFile = useCallback(
    (path: string) => {
      setSelectedPath(path);
      // Find the diff for this path
      const diff = diffs.find((d) => d.newPath === path || d.oldPath === path);
      if (diff && onSelectFile) {
        onSelectFile(path, diff);
      }
    },
    [diffs, onSelectFile]
  );

  return (
    <FileTree
      nodes={filteredTree}
      expandedPaths={effectiveExpandedPaths}
      onToggleExpand={handleToggleExpand}
      selectedPath={selectedPath}
      onSelectFile={handleSelectFile}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      isAllExpanded={isAllExpanded}
      onToggleExpandAll={handleToggleExpandAll}
      className={className}
    />
  );
}
