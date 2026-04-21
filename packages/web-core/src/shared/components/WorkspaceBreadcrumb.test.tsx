import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { WorkspaceBreadcrumb } from './WorkspaceBreadcrumb';
import type { Task, Workspace } from 'shared/types';

// NOTE: web-core has no test runner wired yet (no vitest / testing-library
// installed). This file documents expected behavior and will run once infra
// is added. It must still type-check via `tsc --noEmit`.

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't',
    project_id: 'p',
    title: 'Ship the thing',
    description: null,
    status: 'todo',
    parent_workspace_id: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: 'w0',
    name: 'Manager',
    // Other fields intentionally omitted — casts allow partial for tests.
    ...overrides,
  } as Workspace;
}

describe('WorkspaceBreadcrumb', () => {
  it('renders nothing when both task and parentWorkspace are null', () => {
    const { container } = render(
      <WorkspaceBreadcrumb task={null} parentWorkspace={null} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders task-only segment when there is no parent', () => {
    const { getByText, queryByText } = render(
      <WorkspaceBreadcrumb
        task={makeTask({ title: 'Ship the thing' })}
        parentWorkspace={null}
      />
    );
    expect(getByText('Task: Ship the thing')).toBeTruthy();
    expect(queryByText(/Manager:/)).toBeNull();
  });

  it('renders the full chain when both task, parent, and attemptIndex are provided', () => {
    const { getByText } = render(
      <WorkspaceBreadcrumb
        task={makeTask({ title: 'Ship', parent_workspace_id: 'w0' })}
        parentWorkspace={makeWorkspace({ id: 'w0', name: 'Manager' })}
        attemptIndex={3}
      />
    );
    expect(getByText('Manager: Manager')).toBeTruthy();
    expect(getByText('Task: Ship')).toBeTruthy();
    expect(getByText('Attempt #3')).toBeTruthy();
  });

  it('invokes onSelectWorkspace when the parent segment is clicked', () => {
    const onSelectWorkspace = vi.fn();
    const { getByRole } = render(
      <WorkspaceBreadcrumb
        task={makeTask({ parent_workspace_id: 'w0' })}
        parentWorkspace={makeWorkspace({ id: 'w0', name: 'Manager' })}
        onSelectWorkspace={onSelectWorkspace}
      />
    );
    (
      getByRole('button', { name: /Manager: Manager/ }) as HTMLButtonElement
    ).click();
    expect(onSelectWorkspace).toHaveBeenCalledWith('w0');
  });

  it('falls back to shortened id when parent workspace has empty name', () => {
    const { getByText } = render(
      <WorkspaceBreadcrumb
        task={makeTask({
          parent_workspace_id: 'abcdef12-3456-7890-abcd-ef1234567890',
        })}
        parentWorkspace={makeWorkspace({
          id: 'abcdef12-3456-7890-abcd-ef1234567890',
          name: null,
        })}
      />
    );
    expect(getByText(/Manager: abcdef12/)).toBeTruthy();
  });
});
