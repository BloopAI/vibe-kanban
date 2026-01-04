import React, { createContext, useContext, useMemo, useCallback } from 'react';

interface FileNavigationContextValue {
  /** Navigate to changes panel and scroll to the specified file */
  viewFileInChanges: (path: string) => void;
  /** Set of file paths currently in the diffs (for checking if inline code should be clickable) */
  diffPaths: Set<string>;
  /** Find a diff path matching the given text (supports partial/right-hand match) */
  findMatchingDiffPath: (text: string) => string | null;
}

const EMPTY_SET = new Set<string>();

const defaultValue: FileNavigationContextValue = {
  viewFileInChanges: () => {},
  diffPaths: EMPTY_SET,
  findMatchingDiffPath: () => null,
};

const FileNavigationContext =
  createContext<FileNavigationContextValue>(defaultValue);

interface FileNavigationProviderProps {
  children: React.ReactNode;
  viewFileInChanges: (path: string) => void;
  diffPaths: Set<string>;
}

export function FileNavigationProvider({
  children,
  viewFileInChanges,
  diffPaths,
}: FileNavigationProviderProps) {
  // Find a diff path that matches the given text (exact or right-hand match)
  const findMatchingDiffPath = useCallback(
    (text: string): string | null => {
      // Exact match first
      if (diffPaths.has(text)) return text;

      // Right-hand match: check if any diff path ends with the text
      // Must match at a path boundary (after / or at start)
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
    () => ({ viewFileInChanges, diffPaths, findMatchingDiffPath }),
    [viewFileInChanges, diffPaths, findMatchingDiffPath]
  );

  return (
    <FileNavigationContext.Provider value={value}>
      {children}
    </FileNavigationContext.Provider>
  );
}

export function useFileNavigation(): FileNavigationContextValue {
  return useContext(FileNavigationContext);
}
