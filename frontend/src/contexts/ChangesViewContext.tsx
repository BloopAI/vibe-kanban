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
  fileInView: string | null;
  selectedFilePath: string | null;
  selectedLineNumber: number | null;
  diffPaths: Set<string>;

  scrollToFile: (path: string, lineNumber?: number) => void;
  setFileInView: (path: string) => void;
  unlockScroll: () => void;
  isScrollLocked: () => boolean;

  viewFileInChanges: (filePath: string) => void;
  findMatchingDiffPath: (text: string) => string | null;
}

const EMPTY_SET = new Set<string>();

const defaultValue: ChangesViewContextValue = {
  fileInView: null,
  selectedFilePath: null,
  selectedLineNumber: null,
  diffPaths: EMPTY_SET,
  scrollToFile: () => {},
  setFileInView: () => {},
  unlockScroll: () => {},
  isScrollLocked: () => false,
  viewFileInChanges: () => {},
  findMatchingDiffPath: () => null,
};

const ChangesViewContext = createContext<ChangesViewContextValue>(defaultValue);

interface ChangesViewProviderProps {
  children: React.ReactNode;
}

export function ChangesViewProvider({ children }: ChangesViewProviderProps) {
  const { diffPaths } = useWorkspaceContext();
  const [fileInView, setFileInViewState] = useState<string | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [selectedLineNumber, setSelectedLineNumber] = useState<number | null>(
    null
  );
  const { setRightMainPanelMode } = useUiPreferencesStore();

  const scrollLockedRef = useRef(false);

  const isScrollLocked = useCallback(() => scrollLockedRef.current, []);

  const unlockScroll = useCallback(() => {
    scrollLockedRef.current = false;
  }, []);

  const scrollToFile = useCallback((path: string, lineNumber?: number) => {
    scrollLockedRef.current = true;
    setFileInViewState(path);
    setSelectedFilePath(path);
    setSelectedLineNumber(lineNumber ?? null);
  }, []);

  const setFileInView = useCallback((path: string) => {
    if (scrollLockedRef.current) {
      return;
    }
    setFileInViewState(path);
  }, []);

  const viewFileInChanges = useCallback(
    (filePath: string) => {
      setRightMainPanelMode(RIGHT_MAIN_PANEL_MODES.CHANGES);
      scrollToFile(filePath);
    },
    [setRightMainPanelMode, scrollToFile]
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
      fileInView,
      selectedFilePath,
      selectedLineNumber,
      diffPaths,
      scrollToFile,
      setFileInView,
      unlockScroll,
      isScrollLocked,
      viewFileInChanges,
      findMatchingDiffPath,
    }),
    [
      fileInView,
      selectedFilePath,
      selectedLineNumber,
      diffPaths,
      scrollToFile,
      setFileInView,
      unlockScroll,
      isScrollLocked,
      viewFileInChanges,
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
