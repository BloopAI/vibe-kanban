import {
  createContext,
  useContext,
  useState,
  useMemo,
  useCallback,
  ReactNode,
} from 'react';
import { useTabNavigation } from './TabNavigationContext';

interface ProcessSelectionContextType {
  selectedProcessId: string | null;
  setSelectedProcessId: (id: string | null) => void;
  jumpToProcess: (processId: string) => void;
}

const ProcessSelectionContext =
  createContext<ProcessSelectionContextType | null>(null);

interface ProcessSelectionProviderProps {
  children: ReactNode;
}

export function ProcessSelectionProvider({
  children,
}: ProcessSelectionProviderProps) {
  const { setActiveTab } = useTabNavigation();
  const [selectedProcessId, setSelectedProcessId] = useState<string | null>(
    null
  );

  const jumpToProcess = useCallback(
    (processId: string) => {
      setSelectedProcessId(processId);
      setActiveTab('processes');
    },
    [setActiveTab]
  );

  const value = useMemo(
    () => ({
      selectedProcessId,
      setSelectedProcessId,
      jumpToProcess,
    }),
    [selectedProcessId, setSelectedProcessId, jumpToProcess]
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
