import { useEffect } from 'react';

interface UseUnsavedChangesProps {
  enabled: boolean;
  hasUnsavedChanges: () => boolean;
}

export function useUnsavedChanges({
  enabled,
  hasUnsavedChanges,
}: UseUnsavedChangesProps) {
  useEffect(() => {
    if (!enabled) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges()) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [enabled, hasUnsavedChanges]);
}
