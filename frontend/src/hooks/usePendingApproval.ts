import { useMemo } from 'react';
import { useEntries } from '@/contexts/EntriesContext';

/**
 * Hook to detect if there are any pending approvals in the current conversation entries.
 * When an approval is pending, users should not be able to send follow-ups.
 */
export const usePendingApproval = (): boolean => {
  const { entries } = useEntries();

  const hasPendingApproval = useMemo(() => {
    return entries.some((entry) => {
      if (entry.type !== 'NORMALIZED_ENTRY') return false;
      const entryType = entry.content.entry_type;
      return (
        entryType.type === 'tool_use' &&
        entryType.status.status === 'pending_approval'
      );
    });
  }, [entries]);

  return hasPendingApproval;
};
