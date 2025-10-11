import React, { createContext, useContext, useMemo } from 'react';
import { useExecutionProcessesContext } from '@/contexts/ExecutionProcessesContext';
import { useDraftStream } from '@/hooks/follow-up/useDraftStream';

type RetryUiContextType = {
  activeRetryProcessId: string | null;
  processOrder: Record<string, number>;
  isProcessGreyed: (processId?: string) => boolean;
};

const RetryUiContext = createContext<RetryUiContextType | null>(null);

export function RetryUiProvider({
  attemptId,
  children,
}: {
  attemptId?: string;
  children: React.ReactNode;
}) {
  const { executionProcessesAll: executionProcesses } =
    useExecutionProcessesContext();
  const { retryDraft } = useDraftStream(attemptId);

  const processOrder = useMemo(() => {
    const order: Record<string, number> = {};
    executionProcesses.forEach((p, idx) => {
      order[p.id] = idx;
    });
    return order;
  }, [executionProcesses]);

  const activeRetryProcessId = retryDraft?.retry_process_id ?? null;
  const targetOrder = activeRetryProcessId
    ? (processOrder[activeRetryProcessId] ?? -1)
    : -1;

  const isProcessGreyed = (processId?: string) => {
    if (!activeRetryProcessId || !processId) return false;
    const idx = processOrder[processId];
    if (idx === undefined) return false;
    return idx >= targetOrder; // grey target and later
  };

  const value: RetryUiContextType = {
    activeRetryProcessId,
    processOrder,
    isProcessGreyed,
  };

  return (
    <RetryUiContext.Provider value={value}>{children}</RetryUiContext.Provider>
  );
}

export function useRetryUi() {
  const ctx = useContext(RetryUiContext);
  if (!ctx)
    return {
      activeRetryProcessId: null,
      processOrder: {},
      isProcessGreyed: () => false,
    } as RetryUiContextType;
  return ctx;
}
