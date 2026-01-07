import React, { createContext, useContext, useMemo } from 'react';

interface LogNavigationContextValue {
  /** Navigate to logs panel and select the specified process */
  viewProcessInPanel: (processId: string) => void;
  /** Navigate to logs panel and display static tool content */
  viewToolContentInPanel: (
    toolName: string,
    content: string,
    command?: string
  ) => void;
}

const defaultValue: LogNavigationContextValue = {
  viewProcessInPanel: () => {},
  viewToolContentInPanel: () => {},
};

const LogNavigationContext =
  createContext<LogNavigationContextValue>(defaultValue);

interface LogNavigationProviderProps {
  children: React.ReactNode;
  viewProcessInPanel: (processId: string) => void;
  viewToolContentInPanel: (
    toolName: string,
    content: string,
    command?: string
  ) => void;
}

export function LogNavigationProvider({
  children,
  viewProcessInPanel,
  viewToolContentInPanel,
}: LogNavigationProviderProps) {
  const value = useMemo(
    () => ({ viewProcessInPanel, viewToolContentInPanel }),
    [viewProcessInPanel, viewToolContentInPanel]
  );

  return (
    <LogNavigationContext.Provider value={value}>
      {children}
    </LogNavigationContext.Provider>
  );
}

export function useLogNavigation(): LogNavigationContextValue {
  return useContext(LogNavigationContext);
}
