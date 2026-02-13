import React, {
  useContext,
  useState,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import { createHmrContext } from '@/lib/hmrContext.ts';
import {
  useUiPreferencesStore,
  RIGHT_MAIN_PANEL_MODES,
} from '@/stores/useUiPreferencesStore';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';

/** Callback type for scroll-to-file implementation (provided by ChangesPanelContainer) */
export type ScrollToFileCallback = (path: string, lineNumber?: number) => void;

interface ChangesViewContextValue {
  /** File path selected by user (triggers scroll-to in ChangesPanelContainer) */
  selectedFilePath: string | null;
  /** Line number to scroll to within the selected file (for GitHub comment navigation) */
  selectedLineNumber: number | null;
  /** File currently in view from scrolling (for FileTree highlighting) */
  fileInView: string | null;
  /** Select a file and optionally scroll to a specific line (legacy - use scrollToFile for tree clicks) */
  selectFile: (path: string, lineNumber?: number) => void;
  /** Scroll to a file in the diff view (for file tree clicks - uses state machine) */
  scrollToFile: (path: string, lineNumber?: number) => void;
  /** Update the file currently in view (from scroll observer) */
  setFileInView: (path: string | null) => void;
  /** Navigate to changes mode and scroll to a specific file */
  viewFileInChanges: (filePath: string) => void;
  /** Set of file paths currently in the diffs (for checking if inline code should be clickable) */
  diffPaths: Set<string>;
  /** Find a diff path matching the given text (supports partial/right-hand match) */
  findMatchingDiffPath: (text: string) => string | null;
  /** Register the scroll-to-file callback (called by ChangesPanelContainer) */
  registerScrollToFile: (callback: ScrollToFileCallback | null) => void;
}

const EMPTY_SET = new Set<string>();

const defaultValue: ChangesViewContextValue = {
  selectedFilePath: null,
  selectedLineNumber: null,
  fileInView: null,
  selectFile: () => {},
  scrollToFile: () => {},
  setFileInView: () => {},
  viewFileInChanges: () => {},
  diffPaths: EMPTY_SET,
  findMatchingDiffPath: () => null,
  registerScrollToFile: () => {},
};

const ChangesViewContext = createHmrContext<ChangesViewContextValue>(
  'ChangesViewContext',
  defaultValue
);

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

  const scrollToFileCallbackRef = useRef<ScrollToFileCallback | null>(null);

  const registerScrollToFile = useCallback(
    (callback: ScrollToFileCallback | null) => {
      scrollToFileCallbackRef.current = callback;
    },
    []
  );

  const selectFile = useCallback((path: string, lineNumber?: number) => {
    setSelectedFilePath(path);
    setSelectedLineNumber(lineNumber ?? null);
    setFileInView(path);
  }, []);

  const scrollToFile = useCallback(
    (path: string, lineNumber?: number) => {
      if (scrollToFileCallbackRef.current) {
        scrollToFileCallbackRef.current(path, lineNumber);
      } else {
        selectFile(path, lineNumber);
      }
    },
    [selectFile]
  );

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
      scrollToFile,
      setFileInView,
      viewFileInChanges,
      diffPaths,
      findMatchingDiffPath,
      registerScrollToFile,
    }),
    [
      selectedFilePath,
      selectedLineNumber,
      fileInView,
      selectFile,
      scrollToFile,
      viewFileInChanges,
      diffPaths,
      findMatchingDiffPath,
      registerScrollToFile,
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
