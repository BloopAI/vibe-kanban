import {
  createContext,
  useContext,
  useState,
  useMemo,
  useCallback,
  ReactNode,
} from 'react';
import type { TabType } from '@/types/tabs';

interface ProcessSelectionContextType {
  selectedProcessId: string | null;
  setSelectedProcessId: (id: string | null) => void;
  jumpToProcess: (
    processId: string,
    setActiveTab: (tab: TabType) => void
  ) => void;
}

const ProcessSelectionContext =
  createContext<ProcessSelectionContextType | null>(null);

interface ProcessSelectionProviderProps {
  children: ReactNode;
}

export function ProcessSelectionProvider({
  children,
}: ProcessSelectionProviderProps) {
  const [selectedProcessId, setSelectedProcessId] = useState<string | null>(
    null
  );

  const jumpToProcess = useCallback(
    (processId: string, setActiveTab: (tab: TabType) => void) => {
      setSelectedProcessId(processId);
      setActiveTab('processes');
    },
    []
  );

  const value = useMemo(
    () => ({
      selectedProcessId,
      setSelectedProcessId,
      jumpToProcess,
    }),
    [selectedProcessId, jumpToProcess]
  );

  return (
    <ProcessSelectionContext.Provider value={value}>
      {children}
    </ProcessSelectionContext.Provider>
  );
}

export const useProcessSelection = () => {
  const context = useContext(ProcessSelectionContext);
  if (!context) {
    throw new Error(
      'useProcessSelection must be used within ProcessSelectionProvider'
    );
  }
  return context;
};
