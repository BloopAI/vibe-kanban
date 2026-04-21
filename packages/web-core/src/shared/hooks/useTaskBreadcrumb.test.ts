import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { useTaskBreadcrumb } from './useTaskBreadcrumb';
import { tasksApi, workspacesApi } from '@/shared/lib/api';

// NOTE: web-core has no test runner wired yet (no vitest / testing-library
// installed). This file documents expected behavior and will run once infra
// is added. It must still type-check via `tsc --noEmit`.

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

describe('useTaskBreadcrumb', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches task and parent workspace when workspace has task_id', async () => {
    vi.spyOn(tasksApi, 'get').mockResolvedValue({
      id: 't1',
      project_id: 'p',
      title: 'T',
      description: null,
      status: 'todo',
      parent_workspace_id: 'w0',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    });
    vi.spyOn(workspacesApi, 'get').mockResolvedValue({
      id: 'w0',
      name: 'Manager',
    } as never);

    const { result } = renderHook(
      () => useTaskBreadcrumb({ id: 'w1', task_id: 't1' }),
      { wrapper: makeWrapper() }
    );
    await waitFor(() => expect(result.current.task?.id).toBe('t1'));
    await waitFor(() => expect(result.current.parentWorkspace?.id).toBe('w0'));
  });

  it('returns null task when workspace has no task_id', () => {
    const { result } = renderHook(
      () => useTaskBreadcrumb({ id: 'w1', task_id: null }),
      { wrapper: makeWrapper() }
    );
    expect(result.current.task).toBeNull();
    expect(result.current.parentWorkspace).toBeNull();
  });

  it('returns null parent when task has no parent_workspace_id', async () => {
    vi.spyOn(tasksApi, 'get').mockResolvedValue({
      id: 't1',
      project_id: 'p',
      title: 'T',
      description: null,
      status: 'todo',
      parent_workspace_id: null,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    });

    const { result } = renderHook(
      () => useTaskBreadcrumb({ id: 'w1', task_id: 't1' }),
      { wrapper: makeWrapper() }
    );
    await waitFor(() => expect(result.current.task?.id).toBe('t1'));
    expect(result.current.parentWorkspace).toBeNull();
  });
});
