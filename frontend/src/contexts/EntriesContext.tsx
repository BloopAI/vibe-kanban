import {
  createContext,
  useContext,
  useState,
  useMemo,
  useCallback,
  ReactNode,
} from 'react';
import type { PatchTypeWithKey } from '@/hooks/useConversationHistory';
import { TokenUsageInfo } from 'shared/types';

interface EntriesContextType {
  entries: PatchTypeWithKey[];
  setEntries: (entries: PatchTypeWithKey[]) => void;
  setTokenUsageInfo: (info: TokenUsageInfo | null) => void;
  reset: () => void;
  tokenUsageInfo: TokenUsageInfo | null;
}

const EntriesContext = createContext<EntriesContextType | null>(null);

interface EntriesProviderProps {
  children: ReactNode;
}

export const EntriesProvider = ({ children }: EntriesProviderProps) => {
  const [entries, setEntriesState] = useState<PatchTypeWithKey[]>([]);
  const [tokenUsageInfo, setTokenUsageInfo] = useState<TokenUsageInfo | null>(
    null
  );

  const setEntries = useCallback((newEntries: PatchTypeWithKey[]) => {
    setEntriesState(newEntries);
  }, []);

  const setTokenUsageInfoCallback = useCallback(
    (info: TokenUsageInfo | null) => {
      setTokenUsageInfo(info);
    },
    []
  );

  const reset = useCallback(() => {
    setEntriesState([]);
    setTokenUsageInfo(null);
  }, []);

  const value = useMemo(
    () => ({
      entries,
      setEntries,
      setTokenUsageInfo: setTokenUsageInfoCallback,
      reset,
      tokenUsageInfo,
    }),
    [entries, setEntries, setTokenUsageInfoCallback, reset, tokenUsageInfo]
  );

  return (
    <EntriesContext.Provider value={value}>{children}</EntriesContext.Provider>
  );
};

export const useEntries = (): EntriesContextType => {
  const context = useContext(EntriesContext);
  if (!context) {
    throw new Error('useEntries must be used within an EntriesProvider');
  }
  return context;
};

export const useTokenUsage = () => {
  const context = useContext(EntriesContext);
  if (!context) {
    throw new Error('useTokenUsage must be used within an EntriesProvider');
  }
  return context.tokenUsageInfo;
};
