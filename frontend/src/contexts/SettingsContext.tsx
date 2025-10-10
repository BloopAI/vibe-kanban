import React, { createContext, useContext, useState, useCallback } from 'react';

interface SettingsContextType {
  hasUnsavedChanges: boolean;
  setHasUnsavedChanges: (hasChanges: boolean) => void;
  checkForUnsavedChanges: () => boolean;
}

const SettingsContext = createContext<SettingsContextType | null>(null);

interface SettingsProviderProps {
  children: React.ReactNode;
}

export function SettingsProvider({ children }: SettingsProviderProps) {
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const checkForUnsavedChanges = useCallback(() => {
    return hasUnsavedChanges;
  }, [hasUnsavedChanges]);

  return (
    <SettingsContext.Provider
      value={{
        hasUnsavedChanges,
        setHasUnsavedChanges,
        checkForUnsavedChanges,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettingsContext() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error(
      'useSettingsContext must be used within a SettingsProvider'
    );
  }
  return context;
}
