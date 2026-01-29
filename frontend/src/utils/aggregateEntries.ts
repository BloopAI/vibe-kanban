import type {
  PatchTypeWithKey,
  DisplayEntry,
  AggregatedPatchGroup,
  AggregatedDiffGroup,
} from '@/hooks/useConversationHistory/types';

type AggregationType = 'file_read' | 'search' | 'web_fetch';

/**
 * Extracts the file path from a file_edit entry, or null if not a file_edit entry.
 */
function getFileEditPath(entry: PatchTypeWithKey): string | null {
  if (entry.type !== 'NORMALIZED_ENTRY') return null;

  const entryType = entry.content.entry_type;
  if (entryType.type !== 'tool_use') return null;

  const { action_type } = entryType;
  if (action_type.action === 'file_edit') {
    return action_type.path;
  }

  return null;
}

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
 * Also aggregates consecutive file_edit entries for the same file path.
 *
 * Rules:
 * - Only group entries of the same type that follow each other consecutively
 * - For file_edit entries, also group by file path
 * - Preserve the original order of entries
 * - Single entries of an aggregatable type are NOT grouped (returned as-is)
 * - At least 2 consecutive entries of the same type are required to form a group
 */
export function aggregateConsecutiveEntries(
  entries: PatchTypeWithKey[]
): DisplayEntry[] {
  if (entries.length === 0) return [];

  const result: DisplayEntry[] = [];

  // State for tool aggregation (file_read, search, web_fetch)
  let currentToolGroup: PatchTypeWithKey[] = [];
  let currentAggregationType: AggregationType | null = null;

  // State for diff aggregation (file_edit by path)
  let currentDiffGroup: PatchTypeWithKey[] = [];
  let currentDiffPath: string | null = null;

  const flushToolGroup = () => {
    if (currentToolGroup.length === 0) return;

    if (currentToolGroup.length === 1) {
      // Single entry - don't aggregate, return as-is
      result.push(currentToolGroup[0]);
    } else {
      // Multiple entries - create an aggregated group
      const firstEntry = currentToolGroup[0];
      const aggregatedGroup: AggregatedPatchGroup = {
        type: 'AGGREGATED_GROUP',
        aggregationType: currentAggregationType!,
        entries: [...currentToolGroup],
        patchKey: `agg:${firstEntry.patchKey}`,
        executionProcessId: firstEntry.executionProcessId,
      };
      result.push(aggregatedGroup);
    }

    currentToolGroup = [];
    currentAggregationType = null;
  };

  const flushDiffGroup = () => {
    if (currentDiffGroup.length === 0) return;

    if (currentDiffGroup.length === 1) {
      // Single entry - don't aggregate, return as-is
      result.push(currentDiffGroup[0]);
    } else {
      // Multiple entries for same file - create an aggregated diff group
      const firstEntry = currentDiffGroup[0];
      const aggregatedDiffGroup: AggregatedDiffGroup = {
        type: 'AGGREGATED_DIFF_GROUP',
        filePath: currentDiffPath!,
        entries: [...currentDiffGroup],
        patchKey: `agg-diff:${firstEntry.patchKey}`,
        executionProcessId: firstEntry.executionProcessId,
      };
      result.push(aggregatedDiffGroup);
    }

    currentDiffGroup = [];
    currentDiffPath = null;
  };

  for (const entry of entries) {
    const aggregationType = getAggregationType(entry);
    const fileEditPath = getFileEditPath(entry);

    // Handle file_edit entries
    if (fileEditPath !== null) {
      // Flush any pending tool group first
      flushToolGroup();

      if (currentDiffPath === null) {
        // Start a new diff group
        currentDiffPath = fileEditPath;
        currentDiffGroup.push(entry);
      } else if (fileEditPath === currentDiffPath) {
        // Same file - add to current diff group
        currentDiffGroup.push(entry);
      } else {
        // Different file - flush current diff group and start new one
        flushDiffGroup();
        currentDiffPath = fileEditPath;
        currentDiffGroup.push(entry);
      }
    }
    // Handle tool aggregation (file_read, search, web_fetch)
    else if (aggregationType !== null) {
      // Flush any pending diff group first
      flushDiffGroup();

      if (currentAggregationType === null) {
        // Start a new tool group
        currentAggregationType = aggregationType;
        currentToolGroup.push(entry);
      } else if (aggregationType === currentAggregationType) {
        // Same type - add to current group
        currentToolGroup.push(entry);
      } else {
        // Different aggregatable type - flush current group and start new one
        flushToolGroup();
        currentAggregationType = aggregationType;
        currentToolGroup.push(entry);
      }
    }
    // Non-aggregatable entry
    else {
      // Flush any pending groups and add this entry
      flushToolGroup();
      flushDiffGroup();
      result.push(entry);
    }
  }

  // Flush any remaining groups
  flushToolGroup();
  flushDiffGroup();

  return result;
}
