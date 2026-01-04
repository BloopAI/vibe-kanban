import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { ChangesPanel } from '../views/ChangesPanel';
import type { Diff, DiffChangeKind } from 'shared/types';

// Auto-collapse defaults based on change type (matches DiffsPanel behavior)
const COLLAPSE_BY_CHANGE_TYPE: Record<DiffChangeKind, boolean> = {
  added: false, // Expand added files
  deleted: true, // Collapse deleted files
  modified: false, // Expand modified files
  renamed: true, // Collapse renamed files
  copied: true, // Collapse copied files
  permissionChange: true, // Collapse permission changes
};

// Collapse large diffs (over 200 lines)
const COLLAPSE_MAX_LINES = 200;

function shouldAutoCollapse(diff: Diff): boolean {
  // Collapse based on change type
  if (COLLAPSE_BY_CHANGE_TYPE[diff.change]) {
    return true;
  }

  // Collapse large diffs
  const totalLines = (diff.additions ?? 0) + (diff.deletions ?? 0);
  if (totalLines > COLLAPSE_MAX_LINES) {
    return true;
  }

  return false;
}

interface ChangesPanelContainerProps {
  diffs: Diff[];
  selectedFilePath?: string | null;
  className?: string;
}

export function ChangesPanelContainer({
  diffs,
  selectedFilePath,
  className,
}: ChangesPanelContainerProps) {
  const diffRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  // Track which diffs we've processed for auto-collapse
  const [processedPaths] = useState(() => new Set<string>());

  useEffect(() => {
    if (!selectedFilePath) return;

    // Defer to next frame to ensure ref is attached after render
    const timeoutId = setTimeout(() => {
      diffRefs.current.get(selectedFilePath)?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [selectedFilePath]);

  const handleDiffRef = useCallback(
    (path: string, el: HTMLDivElement | null) => {
      if (el) {
        diffRefs.current.set(path, el);
      } else {
        diffRefs.current.delete(path);
      }
    },
    []
  );

  // Compute initial expanded state, but pass the Diff directly for stable references
  const diffItems = useMemo(() => {
    return diffs.map((diff) => {
      const path = diff.newPath || diff.oldPath || '';

      // Determine initial expanded state for new diffs
      let initialExpanded = true;
      if (!processedPaths.has(path)) {
        processedPaths.add(path);
        initialExpanded = !shouldAutoCollapse(diff);
      }

      return { diff, initialExpanded };
    });
  }, [diffs]);

  return (
    <ChangesPanel
      className={className}
      diffItems={diffItems}
      onDiffRef={handleDiffRef}
    />
  );
}
