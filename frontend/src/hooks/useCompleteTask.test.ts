import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useCompleteTask } from './useCompleteTask';

vi.mock('@/lib/api', () => ({
  attemptsApi: {
    complete: vi.fn(),
  },
}));

import { attemptsApi } from '@/lib/api';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
};

describe('useCompleteTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls attemptsApi.complete with the attemptId', async () => {
    vi.mocked(attemptsApi.complete).mockResolvedValue(undefined);

    const { result } = renderHook(
      () => useCompleteTask('attempt-123'),
      { wrapper: createWrapper() }
    );

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(attemptsApi.complete).toHaveBeenCalledWith('attempt-123');
  });

  it('resolves without calling API when attemptId is undefined', async () => {
    const { result } = renderHook(
      () => useCompleteTask(undefined),
      { wrapper: createWrapper() }
    );

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(attemptsApi.complete).not.toHaveBeenCalled();
  });

  it('invokes onSuccess callback after successful mutation', async () => {
    vi.mocked(attemptsApi.complete).mockResolvedValue(undefined);
    const onSuccess = vi.fn();

    const { result } = renderHook(
      () => useCompleteTask('attempt-123', onSuccess),
      { wrapper: createWrapper() }
    );

    await act(async () => {
      await result.current.mutateAsync();
    });

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it('invokes onError callback when API call fails', async () => {
    const error = new Error('Network error');
    vi.mocked(attemptsApi.complete).mockRejectedValue(error);
    const onError = vi.fn();

    const { result } = renderHook(
      () => useCompleteTask('attempt-123', undefined, onError),
      { wrapper: createWrapper() }
    );

    await act(async () => {
      try {
        await result.current.mutateAsync();
      } catch {
        // Expected — mutateAsync re-throws
      }
    });

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(error);
    });
  });
});
