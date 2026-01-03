import { useRef, useEffect, useCallback } from 'react';
import { ChangesPanel } from '../views/ChangesPanel';
import type { Diff } from 'shared/types';
import type { DiffInput } from '../primitives/conversation/DiffViewCard';

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

  const diffItems = diffs.map((diff) => {
    const path = diff.newPath || diff.oldPath || '';
    return {
      path,
      input: {
        type: 'content' as const,
        oldContent: diff.oldContent || '',
        newContent: diff.newContent || '',
        oldPath: diff.oldPath || undefined,
        newPath: diff.newPath || '',
      } satisfies DiffInput,
    };
  });

  return (
    <ChangesPanel
      className={className}
      diffItems={diffItems}
      onDiffRef={handleDiffRef}
    />
  );
}
