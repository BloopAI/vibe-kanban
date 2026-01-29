import { ExecutorAction, PatchType, Workspace } from 'shared/types';

export type PatchTypeWithKey = PatchType & {
  patchKey: string;
  executionProcessId: string;
};

/**
 * A group of consecutive entries of the same aggregatable type (e.g., file_read, search).
 * Used to display multiple read/search operations in a collapsed accordion style.
 */
export type AggregatedPatchGroup = {
  type: 'AGGREGATED_GROUP';
  /** The aggregation category (e.g., 'file_read', 'search') */
  aggregationType: 'file_read' | 'search';
  /** The individual entries in this group */
  entries: PatchTypeWithKey[];
  /** Unique key for the group */
  patchKey: string;
  executionProcessId: string;
};

export type DisplayEntry = PatchTypeWithKey | AggregatedPatchGroup;

export function isAggregatedGroup(
  entry: DisplayEntry
): entry is AggregatedPatchGroup {
  return entry.type === 'AGGREGATED_GROUP';
}

export type AddEntryType = 'initial' | 'running' | 'historic' | 'plan';

export type OnEntriesUpdated = (
  newEntries: PatchTypeWithKey[],
  addType: AddEntryType,
  loading: boolean
) => void;

export type ExecutionProcessStaticInfo = {
  id: string;
  created_at: string;
  updated_at: string;
  executor_action: ExecutorAction;
};

export type ExecutionProcessState = {
  executionProcess: ExecutionProcessStaticInfo;
  entries: PatchTypeWithKey[];
};

export type ExecutionProcessStateStore = Record<string, ExecutionProcessState>;

export interface UseConversationHistoryParams {
  attempt: Workspace;
  onEntriesUpdated: OnEntriesUpdated;
}

export interface UseConversationHistoryResult {}
