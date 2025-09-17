import { createContext, useContext, useRef, useState, useMemo, useCallback, ReactNode } from 'react';
import type { PatchTypeWithKey } from '@/hooks/useConversationHistory';

interface EntriesContextType {
  entries: PatchTypeWithKey[];
  setEntries: (entries: PatchTypeWithKey[]) => void;
  reset: () => void;
}

const EntriesContext = createContext<EntriesContextType | null>(null);

interface EntriesProviderProps {
  children: ReactNode;
}

export const EntriesProvider = ({ children }: EntriesProviderProps) => {
  const entriesRef = useRef<PatchTypeWithKey[]>([]);
  const [, forceRerender] = useState(0);

  const setEntries = useCallback((newEntries: PatchTypeWithKey[]) => {
    entriesRef.current = newEntries;
    forceRerender(prev => prev + 1);
  }, []);

  const reset = useCallback(() => {
    entriesRef.current = [];
    forceRerender(prev => prev + 1);
  }, []);

  const value = useMemo(() => ({
    get entries() { return entriesRef.current; },
    setEntries,
    reset,
  }), [setEntries, reset]);

  return (
    <EntriesContext.Provider value={value}>
      {children}
    </EntriesContext.Provider>
  );
};

export const useEntries = (): EntriesContextType => {
  const context = useContext(EntriesContext);
  if (!context) {
    throw new Error('useEntries must be used within an EntriesProvider');
  }
  return context;
};
