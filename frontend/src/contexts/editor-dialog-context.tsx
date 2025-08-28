import {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
  useMemo,
} from 'react';
import type { TaskAttempt } from 'shared/types';

interface EditorDialogState {
  isOpen: boolean;
  selectedAttempt: TaskAttempt | null;
  showEditorDialog: (attempt: TaskAttempt) => void;
  closeEditorDialog: () => void;
}

const EditorDialogContext = createContext<EditorDialogState | null>(null);

interface EditorDialogProviderProps {
  children: ReactNode;
}

export function EditorDialogProvider({ children }: EditorDialogProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedAttempt, setSelectedAttempt] = useState<TaskAttempt | null>(
    null
  );

  const showEditorDialog = useCallback((attempt: TaskAttempt) => {
    setSelectedAttempt(attempt);
    setIsOpen(true);
  }, []);

  const closeEditorDialog = useCallback(() => {
    setIsOpen(false);
    setSelectedAttempt(null);
  }, []);

  const value = useMemo(
    () => ({
      isOpen,
      selectedAttempt,
      showEditorDialog,
      closeEditorDialog,
    }),
    [isOpen, selectedAttempt, showEditorDialog, closeEditorDialog]
  );

  return (
    <EditorDialogContext.Provider value={value}>
      {children}
    </EditorDialogContext.Provider>
  );
}

export function useEditorDialog(): EditorDialogState {
  const context = useContext(EditorDialogContext);
  if (!context) {
    throw new Error(
      'useEditorDialog must be used within an EditorDialogProvider'
    );
  }
  return context;
}
