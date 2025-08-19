import { createContext, useContext } from 'react';

interface ProcessSelectionContextType {
  jumpToProcess: (processId: string) => void;
}

export const ProcessSelectionContext =
  createContext<ProcessSelectionContextType | null>(null);

export const useProcessSelection = () => {
  const context = useContext(ProcessSelectionContext);
  if (!context) {
    throw new Error(
      'useProcessSelection must be used within ProcessSelectionContext'
    );
  }
  return context;
};
