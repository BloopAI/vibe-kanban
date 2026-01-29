import type {
  PatchTypeWithKey,
  DisplayEntry,
  AggregatedPatchGroup,
} from '@/hooks/useConversationHistory/types';

type AggregationType = 'file_read' | 'search' | 'web_fetch';

/**
 * Determines if a patch entry can be aggregated and returns its aggregation type.
 * Only file_read, search, and web_fetch tool_use entries can be aggregated.
 */
function getAggregationType(entry: PatchTypeWithKey): AggregationType | null {
  if (entry.type !== 'NORMALIZED_ENTRY') return null;

  const entryType = entry.content.entry_type;
  if (entryType.type !== 'tool_use') return null;

  const { action_type } = entryType;
  if (action_type.action === 'file_read') return 'file_read';
  if (action_type.action === 'search') return 'search';
  if (action_type.action === 'web_fetch') return 'web_fetch';

  return null;
}

/**
 * Aggregates consecutive entries of the same aggregatable type (file_read, search, web_fetch)
 * into grouped entries for accordion-style display.
 *
 * Rules:
 * - Only group entries of the same type that follow each other consecutively
 * - Preserve the original order of entries
 * - Single entries of an aggregatable type are NOT grouped (returned as-is)
 * - At least 2 consecutive entries of the same type are required to form a group
 */
export function aggregateConsecutiveEntries(
  entries: PatchTypeWithKey[]
): DisplayEntry[] {
  if (entries.length === 0) return [];

  const result: DisplayEntry[] = [];
  let currentGroup: PatchTypeWithKey[] = [];
  let currentAggregationType: AggregationType | null = null;

  const flushGroup = () => {
    if (currentGroup.length === 0) return;

    if (currentGroup.length === 1) {
      // Single entry - don't aggregate, return as-is
      result.push(currentGroup[0]);
    } else {
      // Multiple entries - create an aggregated group
      const firstEntry = currentGroup[0];
      const aggregatedGroup: AggregatedPatchGroup = {
        type: 'AGGREGATED_GROUP',
        aggregationType: currentAggregationType!,
        entries: [...currentGroup],
        patchKey: `agg:${firstEntry.patchKey}`,
        executionProcessId: firstEntry.executionProcessId,
      };
      result.push(aggregatedGroup);
    }

    currentGroup = [];
    currentAggregationType = null;
  };

  for (const entry of entries) {
    const aggregationType = getAggregationType(entry);

    if (aggregationType === null) {
      // Non-aggregatable entry - flush any current group and add this entry
      flushGroup();
      result.push(entry);
    } else if (currentAggregationType === null) {
      // Start a new potential group
      currentAggregationType = aggregationType;
      currentGroup.push(entry);
    } else if (aggregationType === currentAggregationType) {
      // Same type - add to current group
      currentGroup.push(entry);
    } else {
      // Different aggregatable type - flush current group and start new one
      flushGroup();
      currentAggregationType = aggregationType;
      currentGroup.push(entry);
    }
  }

  // Flush any remaining group
  flushGroup();

  return result;
}
