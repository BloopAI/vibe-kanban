import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
} from 'react';
import {
  useUiPreferencesStore,
  RIGHT_MAIN_PANEL_MODES,
} from '@/stores/useUiPreferencesStore';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';

interface ChangesViewContextValue {
  /** File path selected by user (triggers scroll-to in ChangesPanelContainer) */
  selectedFilePath: string | null;
  /** Line number to scroll to within the selected file (for GitHub comment navigation) */
  selectedLineNumber: number | null;
  /** File currently in view from scrolling (for FileTree highlighting) */
  fileInView: string | null;
  /** Select a file and optionally scroll to a specific line */
  selectFile: (path: string, lineNumber?: number) => void;
  /** Update the file currently in view (from scroll observer) */
  setFileInView: (path: string | null) => void;
  /** Navigate to changes mode and scroll to a specific file */
  viewFileInChanges: (filePath: string) => void;
  /** Set of file paths currently in the diffs (for checking if inline code should be clickable) */
  diffPaths: Set<string>;
  /** Find a diff path matching the given text (supports partial/right-hand match) */
  findMatchingDiffPath: (text: string) => string | null;
}

const EMPTY_SET = new Set<string>();

const defaultValue: ChangesViewContextValue = {
  selectedFilePath: null,
  selectedLineNumber: null,
  fileInView: null,
  selectFile: () => {},
  setFileInView: () => {},
  viewFileInChanges: () => {},
  diffPaths: EMPTY_SET,
  findMatchingDiffPath: () => null,
};

const ChangesViewContext = createContext<ChangesViewContextValue>(defaultValue);

interface ChangesViewProviderProps {
  children: React.ReactNode;
}

export function ChangesViewProvider({ children }: ChangesViewProviderProps) {
  const { diffPaths } = useWorkspaceContext();
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [selectedLineNumber, setSelectedLineNumber] = useState<number | null>(
    null
  );
  const [fileInView, setFileInView] = useState<string | null>(null);
  const { setRightMainPanelMode } = useUiPreferencesStore();

  const selectFile = useCallback((path: string, lineNumber?: number) => {
    setSelectedFilePath(path);
    setSelectedLineNumber(lineNumber ?? null);
    setFileInView(path);
  }, []);

  const viewFileInChanges = useCallback(
    (filePath: string) => {
      setRightMainPanelMode(RIGHT_MAIN_PANEL_MODES.CHANGES);
      setSelectedFilePath(filePath);
    },
    [setRightMainPanelMode]
  );

  const findMatchingDiffPath = useCallback(
    (text: string): string | null => {
      if (diffPaths.has(text)) return text;
      for (const fullPath of diffPaths) {
        if (fullPath.endsWith('/' + text)) {
          return fullPath;
        }
      }
      return null;
    },
    [diffPaths]
  );

  const value = useMemo(
    () => ({
      selectedFilePath,
      selectedLineNumber,
      fileInView,
      selectFile,
      setFileInView,
      viewFileInChanges,
      diffPaths,
      findMatchingDiffPath,
    }),
    [
      selectedFilePath,
      selectedLineNumber,
      fileInView,
      selectFile,
      viewFileInChanges,
      diffPaths,
      findMatchingDiffPath,
    ]
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
