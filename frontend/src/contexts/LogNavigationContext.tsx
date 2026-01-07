import React, { createContext, useContext, useMemo } from 'react';

interface LogNavigationContextValue {
  /** Navigate to logs panel and select the specified process */
  viewProcessInPanel: (processId: string) => void;
}

const defaultValue: LogNavigationContextValue = {
  viewProcessInPanel: () => {},
};

const LogNavigationContext =
  createContext<LogNavigationContextValue>(defaultValue);

interface LogNavigationProviderProps {
  children: React.ReactNode;
  viewProcessInPanel: (processId: string) => void;
}

export function LogNavigationProvider({
  children,
  viewProcessInPanel,
}: LogNavigationProviderProps) {
  const value = useMemo(() => ({ viewProcessInPanel }), [viewProcessInPanel]);

  return (
    <LogNavigationContext.Provider value={value}>
      {children}
    </LogNavigationContext.Provider>
  );
}

export function useLogNavigation(): LogNavigationContextValue {
  return useContext(LogNavigationContext);
}
