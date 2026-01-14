import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
} from 'react';
import { useUiPreferencesStore } from '@/stores/useUiPreferencesStore';

interface ChangesViewContextValue {
  /** File path selected by user (triggers scroll-to in ChangesPanelContainer) */
  selectedFilePath: string | null;
  /** File currently in view from scrolling (for FileTree highlighting) */
  fileInView: string | null;
  /** Select a file and update fileInView */
  selectFile: (path: string) => void;
  /** Update the file currently in view (from scroll observer) */
  setFileInView: (path: string | null) => void;
  /** Navigate to changes mode and scroll to a specific file */
  viewFileInChanges: (filePath: string) => void;
}

const defaultValue: ChangesViewContextValue = {
  selectedFilePath: null,
  fileInView: null,
  selectFile: () => {},
  setFileInView: () => {},
  viewFileInChanges: () => {},
};

const ChangesViewContext = createContext<ChangesViewContextValue>(defaultValue);

interface ChangesViewProviderProps {
  children: React.ReactNode;
}

export function ChangesViewProvider({ children }: ChangesViewProviderProps) {
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [fileInView, setFileInView] = useState<string | null>(null);
  const { setChangesMode } = useUiPreferencesStore();

  const selectFile = useCallback((path: string) => {
    setSelectedFilePath(path);
    setFileInView(path);
  }, []);

  const viewFileInChanges = useCallback(
    (filePath: string) => {
      setChangesMode(true);
      setSelectedFilePath(filePath);
    },
    [setChangesMode]
  );

  const value = useMemo(
    () => ({
      selectedFilePath,
      fileInView,
      selectFile,
      setFileInView,
      viewFileInChanges,
    }),
    [selectedFilePath, fileInView, selectFile, viewFileInChanges]
  );

  return (
    <ChangesViewContext.Provider value={value}>
      {children}
    </ChangesViewContext.Provider>
  );
}

export function useChangesView(): ChangesViewContextValue {
  return useContext(ChangesViewContext);
}
