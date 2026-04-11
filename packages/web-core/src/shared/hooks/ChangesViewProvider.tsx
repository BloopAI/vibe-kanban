import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  useUiPreferencesStore,
  RIGHT_MAIN_PANEL_MODES,
} from '@/shared/stores/useUiPreferencesStore';
import { useDiffPaths } from '@/shared/stores/useWorkspaceDiffStore';
import {
  ChangesViewContext,
  ChangesViewActionsContext,
  type ScrollToFileCallback,
} from '@/shared/hooks/useChangesView';
import { useFileInViewStore } from '@/shared/stores/useFileInViewStore';

interface ChangesViewProviderProps {
  children: React.ReactNode;
}

export function ChangesViewProvider({ children }: ChangesViewProviderProps) {
  const diffPaths = useDiffPaths();
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [selectedLineNumber, setSelectedLineNumber] = useState<number | null>(
    null
  );
  const setRightMainPanelMode = useUiPreferencesStore(
    (s) => s.setRightMainPanelMode
  );

  const scrollToFileCallbackRef = useRef<ScrollToFileCallback | null>(null);
  const diffPathsRef = useRef(diffPaths);
  diffPathsRef.current = diffPaths;

  const registerScrollToFile = useCallback(
    (callback: ScrollToFileCallback | null) => {
      scrollToFileCallbackRef.current = callback;
    },
    []
  );

  const selectFile = useCallback((path: string, lineNumber?: number) => {
    setSelectedFilePath(path);
    setSelectedLineNumber(lineNumber ?? null);
    useFileInViewStore.getState().setFileInView(path);
  }, []);

  const scrollToFile = useCallback(
    (path: string, lineNumber?: number) => {
      setSelectedFilePath(path);
      setSelectedLineNumber(lineNumber ?? null);
      useFileInViewStore.getState().setFileInView(path);

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

  const findMatchingDiffPath = useCallback((text: string): string | null => {
    const currentDiffPaths = diffPathsRef.current;
    if (currentDiffPaths.has(text)) return text;
    for (const fullPath of currentDiffPaths) {
      if (fullPath.endsWith('/' + text)) {
        return fullPath;
      }
    }
    return null;
  }, []);

  const hasDiffPath = useCallback((path: string): boolean => {
    return diffPathsRef.current.has(path);
  }, []);

  const actionsValue = useMemo(
    () => ({ viewFileInChanges, findMatchingDiffPath, hasDiffPath }),
    [viewFileInChanges, findMatchingDiffPath, hasDiffPath]
  );

  const value = useMemo(
    () => ({
      selectedFilePath,
      selectedLineNumber,
      selectFile,
      scrollToFile,
      viewFileInChanges,
      diffPaths,
      findMatchingDiffPath,
      registerScrollToFile,
    }),
    [
      selectedFilePath,
      selectedLineNumber,
      selectFile,
      scrollToFile,
      viewFileInChanges,
      diffPaths,
      findMatchingDiffPath,
      registerScrollToFile,
    ]
  );

  return (
    <ChangesViewActionsContext.Provider value={actionsValue}>
      <ChangesViewContext.Provider value={value}>
        {children}
      </ChangesViewContext.Provider>
    </ChangesViewActionsContext.Provider>
  );
}
