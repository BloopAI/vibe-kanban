import {
  useRef,
  useEffect,
  useCallback,
  useState,
  useMemo,
  MutableRefObject,
} from 'react';
import { ChangesPanel } from '../views/ChangesPanel';
import { sortDiffs } from '@/utils/fileTreeUtils';
import { useChangesView } from '@/contexts/ChangesViewContext';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { useTask } from '@/hooks/useTask';
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

// Hook to observe which diff is currently in view and report it
function useInViewObserver(
  diffRefs: MutableRefObject<Map<string, HTMLDivElement>>,
  containerRef: MutableRefObject<HTMLDivElement | null>,
  onFileInViewChange?: (path: string) => void
) {
  const observerRef = useRef<IntersectionObserver | null>(null);
  const visiblePathsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!onFileInViewChange) return;

    const createObserver = () => {
      // Disconnect existing observer if any
      observerRef.current?.disconnect();

      // Create observer that tracks which diffs are in the top portion of the container
      observerRef.current = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            const path = entry.target.getAttribute('data-diff-path');
            if (!path) return;

            if (entry.isIntersecting) {
              visiblePathsRef.current.add(path);
            } else {
              visiblePathsRef.current.delete(path);
            }
          });

          // Report the first visible path (topmost in the list)
          if (visiblePathsRef.current.size > 0) {
            // Get all visible paths and find the one that appears first in the DOM
            const allRefs = diffRefs.current;
            for (const [path] of allRefs) {
              if (visiblePathsRef.current.has(path)) {
                onFileInViewChange(path);
                break;
              }
            }
          }
        },
        {
          // Use the scrollable container as root (null = viewport)
          root: containerRef.current,
          // Observe intersection with the top 20% of the container
          rootMargin: '0px 0px -80% 0px',
          threshold: 0,
        }
      );

      // Re-observe all currently registered elements
      diffRefs.current.forEach((el) => {
        observerRef.current?.observe(el);
      });
    };

    // Create observer once container is available
    if (containerRef.current) {
      createObserver();
    }

    return () => {
      observerRef.current?.disconnect();
    };
  }, [onFileInViewChange, diffRefs, containerRef]);

  // Callback to observe/unobserve elements
  const observeElement = useCallback(
    (el: HTMLDivElement | null, path: string) => {
      if (!observerRef.current) return;

      // Unobserve previous element with this path if it exists
      const existingEl = diffRefs.current.get(path);
      if (existingEl) {
        observerRef.current.unobserve(existingEl);
      }

      if (el) {
        el.setAttribute('data-diff-path', path);
        observerRef.current.observe(el);
      }
    },
    [diffRefs]
  );

  return observeElement;
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
  const diffRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Track which diffs we've processed for auto-collapse
  const [processedPaths] = useState(() => new Set<string>());

  // Set up intersection observer to track which file is in view
  const observeElement = useInViewObserver(
    diffRefs,
    containerRef,
    setFileInView
  );

  useEffect(() => {
    if (!selectedFilePath) return;

    // Defer to next frame to ensure ref is attached after render
    const timeoutId = setTimeout(() => {
      const fileEl = diffRefs.current.get(selectedFilePath);
      fileEl?.scrollIntoView({
        behavior: 'instant',
        block: 'start',
      });

      // If line number specified, scroll to comment row after file scroll completes
      if (selectedLineNumber && fileEl) {
        setTimeout(() => {
          // Find the comment row by data-line attribute (library uses plain line numbers)
          const selector = `[data-line="${selectedLineNumber}"]`;
          const commentEl = fileEl.querySelector(selector);
          commentEl?.scrollIntoView({ behavior: 'instant', block: 'center' });
        }, 50); // Brief delay to ensure file scroll completes
      }
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [selectedFilePath, selectedLineNumber]);

  const handleDiffRef = useCallback(
    (path: string, el: HTMLDivElement | null) => {
      if (el) {
        diffRefs.current.set(path, el);
      } else {
        diffRefs.current.delete(path);
      }
      // Also observe/unobserve for intersection tracking
      observeElement(el, path);
    },
    [observeElement]
  );

  // Compute initial expanded state, but pass the Diff directly for stable references
  // Sort diffs to match FileTree ordering
  const diffItems = useMemo(() => {
    return sortDiffs(diffs).map((diff) => {
      const path = diff.newPath || diff.oldPath || '';

      // Determine initial expanded state for new diffs
      let initialExpanded = true;
      if (!processedPaths.has(path)) {
        processedPaths.add(path);
        initialExpanded = !shouldAutoCollapse(diff);
      }

      return { diff, initialExpanded };
    });
  }, [diffs, processedPaths]);

  // Guard: Don't render diffs until we have required data
  const projectId = task?.project_id;
  if (!projectId) {
    return (
      <ChangesPanel
        ref={containerRef}
        className={className}
        diffItems={[]}
        projectId=""
        attemptId={attemptId}
      />
    );
  }

  return (
    <ChangesPanel
      ref={containerRef}
      className={className}
      diffItems={diffItems}
      onDiffRef={handleDiffRef}
      projectId={projectId}
      attemptId={attemptId}
    />
  );
}
