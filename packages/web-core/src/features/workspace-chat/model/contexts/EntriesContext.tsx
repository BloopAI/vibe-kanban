import { useContext, useState, useMemo, useCallback, ReactNode } from 'react';
import { createHmrContext } from '@/shared/lib/hmrContext';
import type { PatchTypeWithKey } from '@/shared/hooks/useConversationHistory/types';
import type { TokenUsageInfo } from 'shared/types';

// ---------------------------------------------------------------------------
// Entries context — changes on every streaming update
// ---------------------------------------------------------------------------

interface EntriesContextType {
  entries: PatchTypeWithKey[];
  setEntries: (entries: PatchTypeWithKey[]) => void;
  reset: () => void;
}

interface EntriesActionsContextType {
  setEntries: (entries: PatchTypeWithKey[]) => void;
  reset: () => void;
}

const EntriesContext = createHmrContext<EntriesContextType | null>(
  'EntriesContext',
  null
);

const EntriesActionsContext =
  createHmrContext<EntriesActionsContextType | null>(
    'EntriesActionsContext',
    null
  );

// ---------------------------------------------------------------------------
// Token-usage context — changes only when token stats update (much rarer)
// ---------------------------------------------------------------------------

interface TokenUsageContextType {
  tokenUsageInfo: TokenUsageInfo | null;
  setTokenUsageInfo: (info: TokenUsageInfo | null) => void;
}

const TokenUsageContext = createHmrContext<TokenUsageContextType | null>(
  'TokenUsageContext',
  null
);

// ---------------------------------------------------------------------------
// Provider — nested contexts, single component
// ---------------------------------------------------------------------------

interface EntriesProviderProps {
  children: ReactNode;
}

export const EntriesProvider = ({ children }: EntriesProviderProps) => {
  const [entries, setEntriesState] = useState<PatchTypeWithKey[]>([]);
  const [tokenUsageInfo, setTokenUsageInfoState] =
    useState<TokenUsageInfo | null>(null);

  const setEntries = useCallback((newEntries: PatchTypeWithKey[]) => {
    setEntriesState(newEntries);
  }, []);

  const setTokenUsageInfo = useCallback((info: TokenUsageInfo | null) => {
    setTokenUsageInfoState(info);
  }, []);

  const reset = useCallback(() => {
    setEntriesState([]);
    setTokenUsageInfoState(null);
  }, []);

  const entriesValue = useMemo(
    () => ({ entries, setEntries, reset }),
    [entries, setEntries, reset]
  );

  const entriesActionsValue = useMemo(
    () => ({ setEntries, reset }),
    [setEntries, reset]
  );

  const tokenUsageValue = useMemo(
    () => ({ tokenUsageInfo, setTokenUsageInfo }),
    [tokenUsageInfo, setTokenUsageInfo]
  );

  return (
    <EntriesActionsContext.Provider value={entriesActionsValue}>
      <EntriesContext.Provider value={entriesValue}>
        <TokenUsageContext.Provider value={tokenUsageValue}>
          {children}
        </TokenUsageContext.Provider>
      </EntriesContext.Provider>
    </EntriesActionsContext.Provider>
  );
};

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export const useEntries = (): EntriesContextType => {
  const context = useContext(EntriesContext);
  if (!context) {
    throw new Error('useEntries must be used within an EntriesProvider');
  }
  return context;
};

export const useEntriesActions = (): EntriesActionsContextType => {
  const context = useContext(EntriesActionsContext);
  if (!context) {
    throw new Error('useEntriesActions must be used within an EntriesProvider');
  }
  return context;
};

/**
 * Read token-usage info without subscribing to entries changes.
 * This context only updates when the token stats themselves change,
 * not on every streaming entry update.
 */
export const useTokenUsage = (): TokenUsageInfo | null => {
  const context = useContext(TokenUsageContext);
  if (!context) {
    throw new Error('useTokenUsage must be used within an EntriesProvider');
  }
  return context.tokenUsageInfo;
};

/**
 * Get the setTokenUsageInfo setter without subscribing to entries.
 * Used by useConversationHistory to push token stats into context.
 */
export const useSetTokenUsageInfo = (): ((
  info: TokenUsageInfo | null
) => void) => {
  const context = useContext(TokenUsageContext);
  if (!context) {
    throw new Error(
      'useSetTokenUsageInfo must be used within an EntriesProvider'
    );
  }
  return context.setTokenUsageInfo;
};
