import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { useExecutionProcessesContext } from '@/contexts/ExecutionProcessesContext';

type RetryUiContextType = {
  activeRetryProcessId: string | null;
  setActiveRetryProcessId: (processId: string | null) => void;
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

  const [activeRetryProcessId, setActiveRetryProcessId] = useState<
    string | null
  >(null);

  const processOrder = useMemo(() => {
    const order: Record<string, number> = {};
    executionProcesses.forEach((p, idx) => {
      order[p.id] = idx;
    });
    return order;
  }, [executionProcesses]);

  const isProcessGreyed = useCallback(
    (processId?: string) => {
      if (!activeRetryProcessId || !processId) return false;
      const activeOrder = processOrder[activeRetryProcessId];
      const thisOrder = processOrder[processId];
      // Grey out processes that come AFTER the retry target
      return thisOrder > activeOrder;
    },
    [activeRetryProcessId, processOrder]
  );

  const value: RetryUiContextType = {
    activeRetryProcessId,
    setActiveRetryProcessId,
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
      setActiveRetryProcessId: () => {},
      processOrder: {},
      isProcessGreyed: () => false,
    } as RetryUiContextType;
  return ctx;
}
