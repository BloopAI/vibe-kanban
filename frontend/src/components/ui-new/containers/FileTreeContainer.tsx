import { useState, useMemo, useCallback, useEffect } from 'react';
import { FileTree } from '../views/FileTree';
import {
  buildFileTree,
  filterFileTree,
  getExpandedPathsForSearch,
  getAllFolderPaths,
} from '@/utils/fileTreeUtils';
import type { Diff } from 'shared/types';

// Mock data for development - remove when backend is ready
const MOCK_DIFFS: Diff[] = [
  {
    change: 'modified',
    oldPath: 'src/components/App.tsx',
    newPath: 'src/components/App.tsx',
    oldContent: null,
    newContent: null,
    contentOmitted: true,
    additions: 15,
    deletions: 3,
  },
  {
    change: 'added',
    oldPath: null,
    newPath: 'src/components/ui-new/views/FileTree.tsx',
    oldContent: null,
    newContent: null,
    contentOmitted: true,
    additions: 120,
    deletions: null,
  },
  {
    change: 'added',
    oldPath: null,
    newPath: 'src/components/ui-new/views/FileTreeNode.tsx',
    oldContent: null,
    newContent: null,
    contentOmitted: true,
    additions: 95,
    deletions: null,
  },
  {
    change: 'added',
    oldPath: null,
    newPath: 'src/components/ui-new/views/FileTreeSearchBar.tsx',
    oldContent: null,
    newContent: null,
    contentOmitted: true,
    additions: 65,
    deletions: null,
  },
  {
    change: 'added',
    oldPath: null,
    newPath: 'src/components/ui-new/containers/FileTreeContainer.tsx',
    oldContent: null,
    newContent: null,
    contentOmitted: true,
    additions: 80,
    deletions: null,
  },
  {
    change: 'added',
    oldPath: null,
    newPath: 'src/components/ui-new/types/fileTree.ts',
    oldContent: null,
    newContent: null,
    contentOmitted: true,
    additions: 20,
    deletions: null,
  },
  {
    change: 'added',
    oldPath: null,
    newPath: 'src/utils/fileTreeUtils.ts',
    oldContent: null,
    newContent: null,
    contentOmitted: true,
    additions: 110,
    deletions: null,
  },
  {
    change: 'deleted',
    oldPath: 'src/utils/oldHelper.ts',
    newPath: null,
    oldContent: null,
    newContent: null,
    contentOmitted: true,
    additions: null,
    deletions: 45,
  },
  {
    change: 'modified',
    oldPath: 'src/styles/new/index.css',
    newPath: 'src/styles/new/index.css',
    oldContent: null,
    newContent: null,
    contentOmitted: true,
    additions: 8,
    deletions: 2,
  },
  {
    change: 'renamed',
    oldPath: 'src/utils/helper.ts',
    newPath: 'src/utils/fileHelper.ts',
    oldContent: null,
    newContent: null,
    contentOmitted: true,
    additions: 0,
    deletions: 0,
  },
  {
    change: 'modified',
    oldPath: 'package.json',
    newPath: 'package.json',
    oldContent: null,
    newContent: null,
    contentOmitted: true,
    additions: 2,
    deletions: 1,
  },
];

interface FileTreeContainerProps {
  diffs?: Diff[];
  onSelectFile?: (path: string, diff: Diff) => void;
  className?: string;
}

export function FileTreeContainer({
  diffs = MOCK_DIFFS,
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
