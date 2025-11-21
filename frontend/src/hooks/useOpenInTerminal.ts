import { useCallback } from 'react';
import { attemptsApi } from '@/lib/api';

export function useOpenInTerminal(attemptId?: string) {
  return useCallback(async (): Promise<void> => {
    if (!attemptId) return;

    try {
      await attemptsApi.openTerminal(attemptId);
    } catch (err) {
      console.error('Failed to open terminal:', err);
      // Terminal opening failures are logged but don't require user intervention
      // since the terminal application might not be available
    }
  }, [attemptId]);
}
