import { useState, useEffect, useMemo } from 'react';
import { NormalizedEntry } from 'shared/types.ts';
import { editDiffToWorktreeDiff } from '@/lib/diffUtils.ts';
import DiffFile from '../tasks/TaskDetails/DiffFile.tsx';

// Global state to persist across re-renders during virtualization
const globalCollapsedFilesMap = new Map<string, Set<string>>();

type Props = {
  entry: NormalizedEntry;
  entryIndex: number;
};

function FileEditDiffs({ entry, entryIndex }: Props) {
  // Create a stable key for this entry
  const entryKey = `entry-${entryIndex}`;

  // Check if this is a file edit with diff data - declare early
  const isFileEdit =
    entry.entry_type.type === 'tool_use' &&
    entry.entry_type.action_type.action === 'file_edit';

  const diffs =
    entry.entry_type.type === 'tool_use' &&
    entry.entry_type.action_type.action === 'file_edit'
      ? entry.entry_type.action_type.diffs || []
      : [];

  // Get or create collapsed state for this entry - initialize with pre-collapsed state
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(() => {
    if (globalCollapsedFilesMap.has(entryKey)) {
      return globalCollapsedFilesMap.get(entryKey)!;
    }

    // Pre-populate with all files collapsed by default
    const initialCollapsed = new Set<string>();
    if (isFileEdit && diffs.length > 0) {
      diffs.forEach((diff, diffIndex) => {
        const filePath =
          entry.entry_type.type === 'tool_use' &&
          entry.entry_type.action_type.action === 'file_edit'
            ? entry.entry_type.action_type.path
            : '';
        const worktreeDiff = editDiffToWorktreeDiff(filePath, diff);

        if (worktreeDiff && worktreeDiff.files.length > 0) {
          worktreeDiff.files.forEach((file, fileIndex) => {
            const uniqueFilePath = `${file.path}#entry-${entryIndex}-diff-${diffIndex}-file-${fileIndex}`;
            initialCollapsed.add(uniqueFilePath);
          });
        }
      });
    }

    return initialCollapsed;
  });

  // Sync local state with global state
  useEffect(() => {
    globalCollapsedFilesMap.set(entryKey, collapsedFiles);
  }, [collapsedFiles, entryKey]);

  if (!isFileEdit) {
    return null;
  }

  // Memoize diff processing to prevent recalculation
  const processedDiffs = useMemo(() => {
    return diffs.map((diff, diffIndex) => {
      const filePath =
        entry.entry_type.type === 'tool_use' &&
        entry.entry_type.action_type.action === 'file_edit'
          ? entry.entry_type.action_type.path
          : '';
      const worktreeDiff = editDiffToWorktreeDiff(filePath, diff);
      return { diff, diffIndex, filePath, worktreeDiff };
    });
  }, [diffs, entry.entry_type]);

  // Initialize collapsed state for all diff files only once
  useEffect(() => {
    if (processedDiffs.length > 0 && !globalCollapsedFilesMap.has(entryKey)) {
      const newCollapsedFiles = new Set<string>();

      processedDiffs.forEach(({ worktreeDiff, diffIndex }) => {
        if (worktreeDiff && worktreeDiff.files.length > 0) {
          worktreeDiff.files.forEach((file, fileIndex) => {
            const uniqueFilePath = `${file.path}#entry-${entryIndex}-diff-${diffIndex}-file-${fileIndex}`;
            newCollapsedFiles.add(uniqueFilePath);
          });
        }
      });

      setCollapsedFiles(newCollapsedFiles);
    }
  }, [processedDiffs, entryIndex, entryKey]);

  if (processedDiffs.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 space-y-3">
      {processedDiffs.map(({ worktreeDiff, diffIndex }) => {
        if (!worktreeDiff || worktreeDiff.files.length === 0) {
          return null;
        }

        return worktreeDiff.files.map((file, fileIndex) => {
          // Create unique path for React key and state management, but keep original path for display
          const uniqueFilePath = `${file.path}#entry-${entryIndex}-diff-${diffIndex}-file-${fileIndex}`;

          return (
            <DiffFile
              key={uniqueFilePath}
              file={file}
              collapsedFiles={collapsedFiles}
              setCollapsedFiles={setCollapsedFiles}
              deletable={false}
              stateKey={uniqueFilePath}
            />
          );
        });
      })}
    </div>
  );
}

export default FileEditDiffs;
