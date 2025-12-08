import {
  createContext,
  useContext,
  useCallback,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { CodeReferenceData } from '@/components/ui/code-reference-card';

export type { CodeReferenceData } from '@/components/ui/code-reference-card';

type InsertionCallback = (data: CodeReferenceData) => void;

interface CodeReferenceInsertionContextType {
  /** Register a callback to be called when a code reference should be inserted */
  registerInsertionCallback: (callback: InsertionCallback) => void;
  /** Unregister the insertion callback */
  unregisterInsertionCallback: () => void;
  /** Insert a code reference (calls the registered callback) */
  insertCodeReference: (data: CodeReferenceData) => void;
  /** Whether the editor should be focused after insertion */
  pendingFocus: boolean;
  /** Clear the pending focus flag */
  clearPendingFocus: () => void;
}

const CodeReferenceInsertionContext =
  createContext<CodeReferenceInsertionContextType | null>(null);

export function CodeReferenceInsertionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const callbackRef = useRef<InsertionCallback | null>(null);
  const [pendingFocus, setPendingFocus] = useState(false);

  const registerInsertionCallback = useCallback(
    (callback: InsertionCallback) => {
      callbackRef.current = callback;
    },
    []
  );

  const unregisterInsertionCallback = useCallback(() => {
    callbackRef.current = null;
  }, []);

  const insertCodeReference = useCallback((data: CodeReferenceData) => {
    if (callbackRef.current) {
      callbackRef.current(data);
      setPendingFocus(true);
    }
  }, []);

  const clearPendingFocus = useCallback(() => {
    setPendingFocus(false);
  }, []);

  return (
    <CodeReferenceInsertionContext.Provider
      value={{
        registerInsertionCallback,
        unregisterInsertionCallback,
        insertCodeReference,
        pendingFocus,
        clearPendingFocus,
      }}
    >
      {children}
    </CodeReferenceInsertionContext.Provider>
  );
}

export function useCodeReferenceInsertion() {
  const context = useContext(CodeReferenceInsertionContext);
  if (!context) {
    throw new Error(
      'useCodeReferenceInsertion must be used within a CodeReferenceInsertionProvider'
    );
  }
  return context;
}
