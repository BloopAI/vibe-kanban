import React, { useCallback, useContext, useMemo, useState } from 'react';
import { createHmrContext } from '@/shared/lib/hmrContext';
import { useEntries } from './EntriesContext';

interface EditState {
  entryKey: string;
  processId: string;
  originalMessage: string;
}

interface MessageEditContextType {
  activeEdit: EditState | null;
  startEdit: (
    entryKey: string,
    processId: string,
    originalMessage: string
  ) => void;
  cancelEdit: () => void;
  isEntryGreyed: (entryKey: string) => boolean;
  isInEditMode: boolean;
}

const MessageEditContext = createHmrContext<MessageEditContextType | null>(
  'MessageEditContext',
  null
);

const EMPTY_ORDER: Record<string, number> = {};
const NOOP_IS_GREYED = () => false;

export function MessageEditProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [activeEdit, setActiveEdit] = useState<EditState | null>(null);
  const { entries } = useEntries();

  // Build entry order map only when actively editing.
  // When inactive, return a stable empty reference to prevent
  // downstream useMemo/useCallback deps from changing on every
  // streaming entries update.
  const entryOrder = useMemo(() => {
    if (!activeEdit) return EMPTY_ORDER;
    const order: Record<string, number> = {};
    entries.forEach((entry, idx) => {
      order[entry.patchKey] = idx;
    });
    return order;
  }, [entries, activeEdit]);

  const startEdit = useCallback(
    (entryKey: string, processId: string, originalMessage: string) => {
      setActiveEdit({ entryKey, processId, originalMessage });
    },
    []
  );

  const cancelEdit = useCallback(() => {
    setActiveEdit(null);
  }, []);

  // When not editing, return a stable no-op to avoid context value churn.
  // The entryOrder dep would otherwise create a new callback reference
  // on every entries update even though it always returns false.
  const isEntryGreyed = useCallback(
    (entryKey: string) => {
      if (!activeEdit) return false;
      const activeOrder = entryOrder[activeEdit.entryKey];
      const thisOrder = entryOrder[entryKey];
      return thisOrder > activeOrder;
    },
    [activeEdit, entryOrder]
  );

  const stableIsEntryGreyed = activeEdit ? isEntryGreyed : NOOP_IS_GREYED;
  const isInEditMode = activeEdit !== null;

  const value = useMemo(
    () => ({
      activeEdit,
      startEdit,
      cancelEdit,
      isEntryGreyed: stableIsEntryGreyed,
      isInEditMode,
    }),
    [activeEdit, startEdit, cancelEdit, stableIsEntryGreyed, isInEditMode]
  );

  return (
    <MessageEditContext.Provider value={value}>
      {children}
    </MessageEditContext.Provider>
  );
}

export function useMessageEditContext() {
  const ctx = useContext(MessageEditContext);
  if (!ctx) {
    return {
      activeEdit: null,
      startEdit: () => {},
      cancelEdit: () => {},
      isEntryGreyed: () => false,
      isInEditMode: false,
    } as MessageEditContextType;
  }
  return ctx;
}
