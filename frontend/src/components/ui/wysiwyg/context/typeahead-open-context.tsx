import { useContext, useState, ReactNode } from 'react';
import { createHmrContext } from '@/lib/hmrContext.ts';

export type TypeaheadOpenContextType = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
};

export const TypeaheadOpenContext = createHmrContext<
  TypeaheadOpenContextType | undefined
>('TypeaheadOpenContext', undefined);

export function TypeaheadOpenProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <TypeaheadOpenContext.Provider value={{ isOpen, setIsOpen }}>
      {children}
    </TypeaheadOpenContext.Provider>
  );
}

export function useTypeaheadOpen() {
  const context = useContext(TypeaheadOpenContext);
  if (context === undefined) {
    throw new Error(
      'useTypeaheadOpen must be used within a TypeaheadOpenProvider'
    );
  }
  return context;
}
