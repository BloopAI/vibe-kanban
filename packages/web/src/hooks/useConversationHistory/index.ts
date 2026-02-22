// Re-export types for backward compatibility
export type {
  AddEntryType,
  OnEntriesUpdated,
  PatchTypeWithKey,
} from '@/features/workspace-chat/model/hooks/useConversationHistory/types';

// Re-export the old UI hook with original name for backward compatibility
export { useConversationHistoryOld as useConversationHistory } from '@/features/workspace-chat/model/hooks/useConversationHistory/useConversationHistoryOld';
