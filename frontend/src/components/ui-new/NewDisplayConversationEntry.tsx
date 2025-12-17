import { useMemo } from 'react';
import {
  ActionType,
  NormalizedEntry,
  TaskAttempt,
  type TaskWithAttemptStatus,
} from 'shared/types';
import { DiffLineType, parseInstance } from '@git-diff-view/react';
import { useExpandable } from '@/stores/useExpandableStore';
import DisplayConversationEntry from '@/components/NormalizedConversation/DisplayConversationEntry';
import {
  ChatToolSummary,
  ChatFileEntry,
  ChatMarkdown,
  ChatPlan,
} from './primitives/conversation';

type Props = {
  entry: NormalizedEntry;
  expansionKey: string;
  executionProcessId?: string;
  taskAttempt?: TaskAttempt;
  task?: TaskWithAttemptStatus;
};

type FileEditAction = Extract<ActionType, { action: 'file_edit' }>;

/**
 * Parse unified diff to extract addition/deletion counts
 */
function parseDiffStats(unifiedDiff: string): {
  additions: number;
  deletions: number;
} {
  let additions = 0;
  let deletions = 0;
  try {
    const parsed = parseInstance.parse(unifiedDiff);
    for (const h of parsed.hunks) {
      for (const line of h.lines) {
        if (line.type === DiffLineType.Add) additions++;
        else if (line.type === DiffLineType.Delete) deletions++;
      }
    }
  } catch {
    // Fallback: count lines starting with + or -
    const lines = unifiedDiff.split('\n');
    for (const line of lines) {
      if (line.startsWith('+') && !line.startsWith('+++')) additions++;
      else if (line.startsWith('-') && !line.startsWith('---')) deletions++;
    }
  }
  return { additions, deletions };
}

/**
 * Generate tool summary text from action type
 */
function getToolSummary(
  entryType: Extract<NormalizedEntry['entry_type'], { type: 'tool_use' }>
): string {
  const { action_type, tool_name } = entryType;

  switch (action_type.action) {
    case 'file_read':
      return `Read ${action_type.path}`;
    case 'search':
      return `Searched for "${action_type.query}"`;
    case 'web_fetch':
      return `Fetched ${action_type.url}`;
    case 'command_run':
      return action_type.command || 'Ran command';
    case 'task_create':
      return `Created task: ${action_type.description}`;
    case 'todo_management':
      return `${action_type.operation} todos`;
    case 'tool':
      return tool_name || 'Tool';
    default:
      return tool_name || 'Tool';
  }
}

function NewDisplayConversationEntry({
  entry,
  expansionKey,
  executionProcessId,
  taskAttempt,
  task,
}: Props) {
  const entryType = entry.entry_type;

  // Handle tool_use entries with new components
  if (entryType.type === 'tool_use') {
    const { action_type, status } = entryType;

    // File edit - use ChatFileEntry
    if (action_type.action === 'file_edit') {
      const fileEditAction = action_type as FileEditAction;
      return (
        <div className="px-double py-base space-y-base">
          {fileEditAction.changes.map((change, idx) => (
            <FileEditEntry
              key={idx}
              path={fileEditAction.path}
              change={change}
              expansionKey={`edit:${expansionKey}:${idx}`}
            />
          ))}
        </div>
      );
    }

    // Plan presentation - use ChatPlan
    if (action_type.action === 'plan_presentation') {
      const isPendingApproval = status.status === 'pending_approval';
      return (
        <div className="px-double py-base">
          <PlanEntry
            plan={action_type.plan}
            expansionKey={expansionKey}
            showActions={isPendingApproval}
            taskAttemptId={taskAttempt?.id}
          />
        </div>
      );
    }

    // Other tool uses - use ChatToolSummary
    return (
      <div className="px-double py-base">
        <ChatToolSummary summary={getToolSummary(entryType)} />
      </div>
    );
  }

  // Assistant message - use ChatMarkdown
  if (entryType.type === 'assistant_message') {
    return (
      <div className="px-double py-base">
        <ChatMarkdown content={entry.content} taskAttemptId={taskAttempt?.id} />
      </div>
    );
  }

  // Fallback to old component for all other entry types
  return (
    <DisplayConversationEntry
      entry={entry}
      expansionKey={expansionKey}
      executionProcessId={executionProcessId}
      taskAttempt={taskAttempt}
      task={task}
    />
  );
}

/**
 * File edit entry with expandable diff
 */
function FileEditEntry({
  path,
  change,
  expansionKey,
}: {
  path: string;
  change: FileEditAction['changes'][number];
  expansionKey: string;
}) {
  const [expanded, toggle] = useExpandable(expansionKey, false);

  // Calculate diff stats for edit changes
  const { additions, deletions } = useMemo(() => {
    if (change.action === 'edit' && change.unified_diff) {
      return parseDiffStats(change.unified_diff);
    }
    return { additions: undefined, deletions: undefined };
  }, [change]);

  // For write actions, count as all additions
  const writeAdditions =
    change.action === 'write' ? change.content.split('\n').length : undefined;

  return (
    <ChatFileEntry
      filename={path}
      additions={additions ?? writeAdditions}
      deletions={deletions}
      expanded={expanded}
      onToggle={toggle}
    />
  );
}

/**
 * Plan entry with expandable content and approval actions
 */
function PlanEntry({
  plan,
  expansionKey,
  showActions,
  taskAttemptId,
}: {
  plan: string;
  expansionKey: string;
  showActions: boolean;
  taskAttemptId?: string;
}) {
  const [expanded, toggle] = useExpandable(`plan:${expansionKey}`, true);

  // Extract title from plan content (first line or default)
  const title = useMemo(() => {
    const firstLine = plan.split('\n')[0];
    // Remove markdown heading markers
    const cleanTitle = firstLine.replace(/^#+\s*/, '').trim();
    return cleanTitle || 'Plan';
  }, [plan]);

  return (
    <ChatPlan
      title={`Plan - ${title}`}
      content={plan}
      expanded={expanded}
      onToggle={toggle}
      showActions={showActions}
      taskAttemptId={taskAttemptId}
    />
  );
}

export default NewDisplayConversationEntry;
