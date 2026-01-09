import {
  createContext,
  useContext,
  useState,
  useMemo,
  useCallback,
  ReactNode,
} from 'react';
import type { PatchTypeWithKey } from '@/hooks/useConversationHistory';
import { NormalizedEntry, TokenUsageInfo } from 'shared/types';

interface EntriesContextType {
  entries: PatchTypeWithKey[];
  setEntries: (entries: PatchTypeWithKey[]) => void;
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

  const extractTokenUsageInfo = (
    entries: PatchTypeWithKey[]
  ): TokenUsageInfo | null => {
    const latest = entries.findLast(
      (e) =>
        e.type === 'NORMALIZED_ENTRY' &&
        e.content.entry_type.type === 'token_usage_info'
    )?.content as NormalizedEntry | undefined;
    return (latest?.entry_type as TokenUsageInfo) ?? null;
  };

  const setEntries = useCallback((newEntries: PatchTypeWithKey[]) => {
    setEntriesState(newEntries);
    setTokenUsageInfo(extractTokenUsageInfo(newEntries));
  }, []);

  const reset = useCallback(() => {
    setEntriesState([]);
    setTokenUsageInfo(null);
  }, []);

  const value = useMemo(
    () => ({
      entries,
      setEntries,
      reset,
      tokenUsageInfo,
    }),
    [entries, setEntries, reset, tokenUsageInfo]
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
