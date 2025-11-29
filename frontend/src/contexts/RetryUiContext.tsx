import React, { createContext, useContext, useMemo } from 'react';
import { useExecutionProcessesContext } from '@/contexts/ExecutionProcessesContext';

type RetryUiContextType = {
  activeRetryProcessId: string | null;
  processOrder: Record<string, number>;
  isProcessGreyed: (processId?: string) => boolean;
};

const RetryUiContext = createContext<RetryUiContextType | null>(null);

export function RetryUiProvider({
  children,
}: {
  attemptId?: string;
  children: React.ReactNode;
}) {
  const { executionProcessesAll: executionProcesses } =
    useExecutionProcessesContext();

  const processOrder = useMemo(() => {
    const order: Record<string, number> = {};
    executionProcesses.forEach((p, idx) => {
      order[p.id] = idx;
    });
    return order;
  }, [executionProcesses]);

  // With drafts removed, there's no active retry process
  const activeRetryProcessId = null;

  const isProcessGreyed = () => {
    // With drafts removed, no processes are greyed
    return false;
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
