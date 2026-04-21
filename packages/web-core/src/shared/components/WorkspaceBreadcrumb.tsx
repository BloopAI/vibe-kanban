import type { Task, Workspace } from 'shared/types';

export type WorkspaceBreadcrumbProps = {
  /** Task the current workspace is attached to (null if standalone). */
  task: Task | null;
  /** Parent (manager) workspace, if the task has one. */
  parentWorkspace: Workspace | null;
  /**
   * 1-based attempt index within the parent's children. Omit to hide the
   * "Attempt #N" suffix.
   */
  attemptIndex?: number;
  /**
   * Called when the user clicks the "Manager: ..." segment. Callers inject
   * their surface-specific navigation (local-web vs remote-web paths).
   */
  onSelectWorkspace?: (workspaceId: string) => void;
};

/**
 * Breadcrumb surfacing the `Manager workspace → Task → Attempt #N` chain for
 * nested workspaces. Renders nothing when there's no task and no parent.
 */
export function WorkspaceBreadcrumb({
  task,
  parentWorkspace,
  attemptIndex,
  onSelectWorkspace,
}: WorkspaceBreadcrumbProps) {
  if (!task && !parentWorkspace) return null;

  const segments: React.ReactNode[] = [];

  if (parentWorkspace) {
    const label = parentWorkspace.name?.trim()
      ? parentWorkspace.name
      : parentWorkspace.id.slice(0, 8);
    segments.push(
      onSelectWorkspace ? (
        <button
          key="parent"
          type="button"
          onClick={() => onSelectWorkspace(parentWorkspace.id)}
          className="underline hover:text-normal cursor-pointer"
        >
          Manager: {label}
        </button>
      ) : (
        <span key="parent">Manager: {label}</span>
      )
    );
  }

  if (task) {
    segments.push(<span key="task">Task: {task.title}</span>);
  }

  if (typeof attemptIndex === 'number') {
    segments.push(<span key="attempt">Attempt #{attemptIndex}</span>);
  }

  return (
    <nav
      aria-label="Workspace breadcrumb"
      className="text-sm text-muted-foreground flex flex-wrap items-center gap-2"
    >
      {segments.map((seg, i) => (
        <span key={i} className="flex items-center gap-2">
          {seg}
          {i < segments.length - 1 && <span aria-hidden>/</span>}
        </span>
      ))}
    </nav>
  );
}
