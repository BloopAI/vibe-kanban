import { ReactNode } from 'react';

export type LayoutMode = 'expand' | 'preview' | 'diffs' | null;

interface TasksLayoutProps {
  kanban: ReactNode;
  attempt: ReactNode;
  aux: ReactNode;
  hasAttempt: boolean;
  mode: LayoutMode;
  isMobile?: boolean;
}

export function TasksLayout({
  kanban,
  attempt,
  aux,
  hasAttempt,
  mode,
  isMobile = false,
}: TasksLayoutProps) {
  const columns = (() => {
    if (isMobile) {
      if (hasAttempt) return ['0fr', '1fr', '0fr'];
      return ['1fr', '0fr', '0fr'];
    }

    if (!hasAttempt) return ['1fr', '0fr', '0fr'];

    switch (mode) {
      case 'expand':
        return ['1fr', '2fr', '0fr'];
      case 'preview':
        return ['0fr', '1fr', '1fr'];
      case 'diffs':
        return ['0fr', '1fr', '1fr'];
      case null:
      default:
        return ['2fr', '1fr', '0fr'];
    }
  })();

  const gridTemplateColumns = `minmax(0, ${columns[0]}) minmax(0, ${columns[1]}) minmax(0, ${columns[2]})`;

  const isKanbanVisible = columns[0] !== '0fr';
  const isAttemptVisible = columns[1] !== '0fr';
  const isAuxVisible = columns[2] !== '0fr';

  return (
    <div
      className="h-full min-h-0 grid"
      style={{
        gridTemplateColumns,
        transition: 'grid-template-columns 250ms cubic-bezier(0.2, 0, 0, 1)',
      }}
    >
      <div
        className="min-w-0 min-h-0 overflow-hidden"
        aria-hidden={!isKanbanVisible}
        aria-label="Kanban board"
        role="region"
        style={{ pointerEvents: isKanbanVisible ? 'auto' : 'none' }}
      >
        {kanban}
      </div>

      <div
        className="min-w-0 min-h-0 overflow-hidden border-l"
        aria-hidden={!isAttemptVisible}
        aria-label="Attempt details"
        role="region"
        style={{ pointerEvents: isAttemptVisible ? 'auto' : 'none' }}
      >
        {attempt}
      </div>

      <div
        className="min-w-0 min-h-0 overflow-hidden border-l"
        aria-hidden={!isAuxVisible}
        aria-label={mode === 'preview' ? 'Preview' : 'Diffs'}
        role="region"
        style={{ pointerEvents: isAuxVisible ? 'auto' : 'none' }}
      >
        {aux}
      </div>
    </div>
  );
}
