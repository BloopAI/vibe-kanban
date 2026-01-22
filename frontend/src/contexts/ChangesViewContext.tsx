import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useRef,
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
  /** Get target file path if programmatic scroll is in progress, null otherwise */
  getScrollTarget: () => string | null;
  /** Clear programmatic scroll lock (call when target is visible) */
  clearScrollLock: () => void;
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
  getScrollTarget: () => null,
  clearScrollLock: () => {},
};

const ChangesViewContext = createContext<ChangesViewContextValue>(defaultValue);

interface ChangesViewProviderProps {
  children: React.ReactNode;
}

const SCROLL_LOCK_SAFETY_TIMEOUT_MS = 2000;

export function ChangesViewProvider({ children }: ChangesViewProviderProps) {
  const { diffPaths } = useWorkspaceContext();
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [selectedLineNumber, setSelectedLineNumber] = useState<number | null>(
    null
  );
  const [fileInView, setFileInViewState] = useState<string | null>(null);
  const { setRightMainPanelMode } = useUiPreferencesStore();

  const scrollTargetRef = useRef<string | null>(null);
  const safetyTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const getScrollTarget = useCallback(() => {
    return scrollTargetRef.current;
  }, []);

  const clearScrollLock = useCallback(() => {
    if (safetyTimeoutRef.current) {
      clearTimeout(safetyTimeoutRef.current);
    }
    scrollTargetRef.current = null;
  }, []);

  const selectFile = useCallback((path: string, lineNumber?: number) => {
    if (safetyTimeoutRef.current) {
      clearTimeout(safetyTimeoutRef.current);
    }
    scrollTargetRef.current = path;
    
    safetyTimeoutRef.current = setTimeout(() => {
      scrollTargetRef.current = null;
    }, SCROLL_LOCK_SAFETY_TIMEOUT_MS);
    
    setSelectedFilePath(path);
    setSelectedLineNumber(lineNumber ?? null);
    setFileInViewState(path);
  }, []);

  const setFileInView = useCallback((path: string | null) => {
    if (scrollTargetRef.current !== null) {
      return;
    }
    setFileInViewState(path);
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
      getScrollTarget,
      clearScrollLock,
    }),
    [
      selectedFilePath,
      selectedLineNumber,
      fileInView,
      selectFile,
      setFileInView,
      viewFileInChanges,
      diffPaths,
      findMatchingDiffPath,
      getScrollTarget,
      clearScrollLock,
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
