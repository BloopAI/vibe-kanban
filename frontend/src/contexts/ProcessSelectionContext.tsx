import { createContext, useContext, useState, useMemo, ReactNode } from 'react';

interface ProcessSelectionContextType {
  selectedProcessId: string | null;
  setSelectedProcessId: (id: string | null) => void;
}

const ProcessSelectionContext =
  createContext<ProcessSelectionContextType | null>(null);

interface ProcessSelectionProviderProps {
  children: ReactNode;
  initialProcessId?: string | null;
}

export function ProcessSelectionProvider({
  children,
  initialProcessId = null,
}: ProcessSelectionProviderProps) {
  const [selectedProcessId, setSelectedProcessId] = useState<string | null>(
    initialProcessId
  );

  const value = useMemo(
    () => ({
      selectedProcessId,
      setSelectedProcessId,
    }),
    [selectedProcessId, setSelectedProcessId]
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
