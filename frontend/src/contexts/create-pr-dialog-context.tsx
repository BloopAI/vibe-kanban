import {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
  useMemo,
} from 'react';
import type { TaskAttempt, TaskWithAttemptStatus } from 'shared/types';

interface CreatePRDialogData {
  attempt: TaskAttempt;
  task: TaskWithAttemptStatus;
  projectId: string;
}

interface CreatePRDialogState {
  isOpen: boolean;
  data: CreatePRDialogData | null;
  showCreatePRDialog: (data: CreatePRDialogData) => void;
  closeCreatePRDialog: () => void;
}

const CreatePRDialogContext = createContext<CreatePRDialogState | null>(null);

interface CreatePRDialogProviderProps {
  children: ReactNode;
}

export function CreatePRDialogProvider({
  children,
}: CreatePRDialogProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [data, setData] = useState<CreatePRDialogData | null>(null);

  const showCreatePRDialog = useCallback((data: CreatePRDialogData) => {
    setData(data);
    setIsOpen(true);
  }, []);

  const closeCreatePRDialog = useCallback(() => {
    setIsOpen(false);
    setData(null);
  }, []);

  const value = useMemo(
    () => ({
      isOpen,
      data,
      showCreatePRDialog,
      closeCreatePRDialog,
    }),
    [isOpen, data, showCreatePRDialog, closeCreatePRDialog]
  );

  return (
    <CreatePRDialogContext.Provider value={value}>
      {children}
    </CreatePRDialogContext.Provider>
  );
}

export function useCreatePRDialog(): CreatePRDialogState {
  const context = useContext(CreatePRDialogContext);
  if (!context) {
    throw new Error(
      'useCreatePRDialog must be used within a CreatePRDialogProvider'
    );
  }
  return context;
}
