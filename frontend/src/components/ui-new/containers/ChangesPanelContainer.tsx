import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { debounce } from 'lodash';
import { ListRange } from 'react-virtuoso';
import {
  ChangesPanel,
  type ChangesPanelHandle,
} from '../views/ChangesPanel';
import { sortDiffs } from '@/utils/fileTreeUtils';
import { useChangesView } from '@/contexts/ChangesViewContext';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { useTask } from '@/hooks/useTask';
import type { Diff, DiffChangeKind } from 'shared/types';

const COLLAPSE_BY_CHANGE_TYPE: Record<DiffChangeKind, boolean> = {
  added: false,
  deleted: true,
  modified: false,
  renamed: true,
  copied: true,
  permissionChange: true,
};

const COLLAPSE_MAX_LINES = 200;

function shouldAutoCollapse(diff: Diff): boolean {
  if (COLLAPSE_BY_CHANGE_TYPE[diff.change]) {
    return true;
  }

  const totalLines = (diff.additions ?? 0) + (diff.deletions ?? 0);
  if (totalLines > COLLAPSE_MAX_LINES) {
    return true;
  }

  return false;
}

interface ChangesPanelContainerProps {
  className: string;
  /** Attempt ID for opening files in IDE */
  attemptId: string;
}

export function ChangesPanelContainer({
  className,
  attemptId,
}: ChangesPanelContainerProps) {
  const { diffs, workspace } = useWorkspaceContext();
  const { data: task } = useTask(workspace?.task_id, {
    enabled: !!workspace?.task_id,
  });
  const { selectedFilePath, selectedLineNumber, setFileInView } =
    useChangesView();
  const panelRef = useRef<ChangesPanelHandle>(null);
  const diffRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [processedPaths] = useState(() => new Set<string>());

  const diffItems = useMemo(() => {
    return sortDiffs(diffs).map((diff) => {
      const path = diff.newPath || diff.oldPath || '';

      let initialExpanded = true;
      if (!processedPaths.has(path)) {
        processedPaths.add(path);
        initialExpanded = !shouldAutoCollapse(diff);
      }

      return { diff, initialExpanded };
    });
  }, [diffs, processedPaths]);

  const pathToIndex = useMemo(() => {
    const map = new Map<string, number>();
    diffItems.forEach(({ diff }, index) => {
      const path = diff.newPath || diff.oldPath || '';
      if (path) map.set(path, index);
    });
    return map;
  }, [diffItems]);

  useEffect(() => {
    if (!selectedFilePath) return;

    const index = pathToIndex.get(selectedFilePath);
    if (index === undefined) return;

    const timeoutId = setTimeout(() => {
      panelRef.current?.scrollToIndex(index);

      if (selectedLineNumber) {
        setTimeout(() => {
          const fileEl = diffRefs.current.get(selectedFilePath);
          if (fileEl) {
            const selector = `[data-line="${selectedLineNumber}"]`;
            const commentEl = fileEl.querySelector(selector);
            commentEl?.scrollIntoView({ behavior: 'instant', block: 'center' });
          }
        }, 100);
      }
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [selectedFilePath, selectedLineNumber, pathToIndex]);

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

  const FILE_COUNT_DEBOUNCE_THRESHOLD = 20;

  const debouncedSetFileInView = useMemo(
    () =>
      debounce((path: string) => setFileInView(path), 100, { leading: true }),
    [setFileInView]
  );

  useEffect(() => {
    return () => debouncedSetFileInView.cancel();
  }, [debouncedSetFileInView]);

  const handleRangeChanged = useCallback(
    (range: ListRange) => {
      const firstVisibleItem = diffItems[range.startIndex];
      if (firstVisibleItem) {
        const path =
          firstVisibleItem.diff.newPath || firstVisibleItem.diff.oldPath || '';
        if (path) {
          if (diffItems.length <= FILE_COUNT_DEBOUNCE_THRESHOLD) {
            setFileInView(path);
          } else {
            debouncedSetFileInView(path);
          }
        }
      }
    },
    [diffItems, debouncedSetFileInView, setFileInView]
  );

  const projectId = task?.project_id;
  if (!projectId) {
    return (
      <ChangesPanel
        ref={panelRef}
        className={className}
        diffItems={[]}
        projectId=""
        attemptId={attemptId}
      />
    );
  }

  return (
    <ChangesPanel
      ref={panelRef}
      className={className}
      diffItems={diffItems}
      onDiffRef={handleDiffRef}
      onRangeChanged={handleRangeChanged}
      projectId={projectId}
      attemptId={attemptId}
    />
  );
}
