import {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
  useMemo,
} from 'react';
import type { TaskAttempt } from 'shared/types';
import NiceModal from '@ebay/nice-modal-react';

interface EditorDialogState {
  selectedAttempt: TaskAttempt | null;
  showEditorDialog: (attempt: TaskAttempt) => void;
}

const EditorDialogContext = createContext<EditorDialogState | null>(null);

interface EditorDialogProviderProps {
  children: ReactNode;
}

export function EditorDialogProvider({ children }: EditorDialogProviderProps) {
  const [selectedAttempt, setSelectedAttempt] = useState<TaskAttempt | null>(
    null
  );

  const showEditorDialog = useCallback((attempt: TaskAttempt) => {
    setSelectedAttempt(attempt);
    NiceModal.show('editor-selection', { selectedAttempt: attempt });
  }, []);

  const value = useMemo(
    () => ({
      selectedAttempt,
      showEditorDialog,
    }),
    [selectedAttempt, showEditorDialog]
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
