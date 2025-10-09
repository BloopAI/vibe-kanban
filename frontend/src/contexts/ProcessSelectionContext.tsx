import { createContext, useContext, useState, useMemo, ReactNode } from 'react';

interface ProcessSelectionContextType {
  selectedProcessId: string | null;
  setSelectedProcessId: (id: string | null) => void;
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
