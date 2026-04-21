import { describe, it, expect, vi, afterEach } from 'vitest';
import { tasksApi } from './api';

// NOTE: web-core has no test runner wired yet. This file exists for future
// vitest setup and to document the expected shape — it is not executed in CI.

describe('tasksApi.get', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('unwraps ApiResponse envelope on success', async () => {
    const fakeTask = {
      id: 'abc',
      project_id: 'p',
      title: 't',
      description: null,
      status: 'todo',
      parent_workspace_id: null,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    };
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ success: true, data: fakeTask, message: null }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        )
    );
    const task = await tasksApi.get('abc');
    expect(task.id).toBe('abc');
    expect(task.title).toBe('t');
  });

  it('throws when envelope reports failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: false,
            data: null,
            message: 'not found',
          }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );
    await expect(tasksApi.get('abc')).rejects.toThrow(/not found/);
  });
});
