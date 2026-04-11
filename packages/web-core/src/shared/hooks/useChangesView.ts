import { useContext } from 'react';
import { createHmrContext } from '@/shared/lib/hmrContext';

/** Callback type for scroll-to-file implementation (provided by ChangesPanelContainer) */
export type ScrollToFileCallback = (path: string, lineNumber?: number) => void;

interface ChangesViewContextValue {
  selectedFilePath: string | null;
  selectedLineNumber: number | null;
  selectFile: (path: string, lineNumber?: number) => void;
  scrollToFile: (path: string, lineNumber?: number) => void;
  viewFileInChanges: (filePath: string) => void;
  diffPaths: Set<string>;
  findMatchingDiffPath: (text: string) => string | null;
  registerScrollToFile: (callback: ScrollToFileCallback | null) => void;
}

interface ChangesViewActionsContextValue {
  viewFileInChanges: (filePath: string) => void;
  findMatchingDiffPath: (text: string) => string | null;
  hasDiffPath: (path: string) => boolean;
}

const EMPTY_SET = new Set<string>();

const defaultValue: ChangesViewContextValue = {
  selectedFilePath: null,
  selectedLineNumber: null,
  selectFile: () => {},
  scrollToFile: () => {},
  viewFileInChanges: () => {},
  diffPaths: EMPTY_SET,
  findMatchingDiffPath: () => null,
  registerScrollToFile: () => {},
};

const defaultActionsValue: ChangesViewActionsContextValue = {
  viewFileInChanges: () => {},
  findMatchingDiffPath: () => null,
  hasDiffPath: () => false,
};

export const ChangesViewContext = createHmrContext<ChangesViewContextValue>(
  'ChangesViewContext',
  defaultValue
);

export const ChangesViewActionsContext =
  createHmrContext<ChangesViewActionsContextValue>(
    'ChangesViewActionsContext',
    defaultActionsValue
  );

export function useChangesView(): ChangesViewContextValue {
  return useContext(ChangesViewContext);
}

export function useChangesViewActions(): ChangesViewActionsContextValue {
  return useContext(ChangesViewActionsContext);
}
