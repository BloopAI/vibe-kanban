import { useMemo, useCallback } from 'react';
import {
  ActionType,
  NormalizedEntry,
  ToolStatus,
  TodoItem,
  type TaskWithAttemptStatus,
} from 'shared/types';
import type { WorkspaceWithSession } from '@/types/attempt';
import { DiffLineType, parseInstance } from '@git-diff-view/react';
import { useExpandable } from '@/stores/useExpandableStore';
import DisplayConversationEntry from '@/components/NormalizedConversation/DisplayConversationEntry';
import { useApprovalFeedbackOptional } from '@/contexts/ApprovalFeedbackContext';
import { useMessageEditContext } from '@/contexts/MessageEditContext';
import { useApprovalMutation } from '@/hooks/useApprovalMutation';
import { cn } from '@/lib/utils';
import {
  ChatToolSummary,
  ChatTodoList,
  ChatFileEntry,
  ChatPlan,
  ChatUserMessage,
  ChatAssistantMessage,
  ChatSystemMessage,
  ChatThinkingMessage,
  ChatErrorMessage,
} from './primitives/conversation';

type Props = {
  entry: NormalizedEntry;
  expansionKey: string;
  executionProcessId?: string;
  taskAttempt?: WorkspaceWithSession;
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
        <>
          {fileEditAction.changes.map((change, idx) => (
            <FileEditEntry
              key={idx}
              path={fileEditAction.path}
              change={change}
              expansionKey={`edit:${expansionKey}:${idx}`}
              status={status}
            />
          ))}
        </>
      );
    }

    // Plan presentation - use ChatPlan
    if (action_type.action === 'plan_presentation') {
      const isPendingApproval = status.status === 'pending_approval';
      const pendingStatus = isPendingApproval
        ? (status as Extract<ToolStatus, { status: 'pending_approval' }>)
        : undefined;

      return (
        <PlanEntry
          plan={action_type.plan}
          expansionKey={expansionKey}
          showActions={isPendingApproval}
          workspaceId={taskAttempt?.id}
          approvalStatus={pendingStatus}
          executionProcessId={executionProcessId}
          status={status}
        />
      );
    }

    // Todo management - use ChatTodoList
    if (action_type.action === 'todo_management') {
      return (
        <TodoManagementEntry
          todos={action_type.todos}
          expansionKey={expansionKey}
        />
      );
    }

    // Other tool uses - use ChatToolSummary
    return (
      <ToolSummaryEntry
        summary={getToolSummary(entryType)}
        expansionKey={expansionKey}
        status={status}
      />
    );
  }

  // User message - use ChatUserMessage
  if (entryType.type === 'user_message') {
    return (
      <UserMessageEntry
        content={entry.content}
        expansionKey={expansionKey}
        workspaceId={taskAttempt?.id}
        executionProcessId={executionProcessId}
      />
    );
  }

  // Assistant message - use ChatAssistantMessage
  if (entryType.type === 'assistant_message') {
    return (
      <AssistantMessageEntry
        content={entry.content}
        workspaceId={taskAttempt?.id}
      />
    );
  }

  // System message - use ChatSystemMessage
  if (entryType.type === 'system_message') {
    return (
      <SystemMessageEntry content={entry.content} expansionKey={expansionKey} />
    );
  }

  // Thinking message - use ChatThinkingMessage
  if (entryType.type === 'thinking') {
    return (
      <ChatThinkingMessage
        content={entry.content}
        taskAttemptId={taskAttempt?.id}
      />
    );
  }

  // Error message - use ChatErrorMessage
  if (entryType.type === 'error_message') {
    return (
      <ErrorMessageEntry content={entry.content} expansionKey={expansionKey} />
    );
  }

  // The new design doesn't need the next action bar
  if (entryType.type === 'next_action') {
    return null;
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
  status,
}: {
  path: string;
  change: FileEditAction['changes'][number];
  expansionKey: string;
  status: ToolStatus;
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
      status={status}
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
  workspaceId,
  approvalStatus,
  executionProcessId,
  status,
}: {
  plan: string;
  expansionKey: string;
  showActions: boolean;
  workspaceId?: string;
  approvalStatus?: Extract<ToolStatus, { status: 'pending_approval' }>;
  executionProcessId?: string;
  status: ToolStatus;
}) {
  // Expand plans by default, unless plan is not active
  const feedbackContext = useApprovalFeedbackOptional();
  const { approve, isApproving } = useApprovalMutation();
  const pendingApproval = status.status === 'pending_approval';
  const [expanded, toggle] = useExpandable(
    `plan:${expansionKey}`,
    pendingApproval
  );

  // Check if approval timed out
  const isTimedOut = approvalStatus
    ? new Date() > new Date(approvalStatus.timeout_at)
    : false;

  // Extract title from plan content (first line or default)
  const title = useMemo(() => {
    const firstLine = plan.split('\n')[0];
    // Remove markdown heading markers
    const cleanTitle = firstLine.replace(/^#+\s*/, '').trim();
    return cleanTitle || 'Plan';
  }, [plan]);

  // Handle approve action
  const handleApprove = useCallback(() => {
    if (!approvalStatus || !executionProcessId || isApproving) return;

    // Exit feedback mode if active
    feedbackContext?.exitFeedbackMode();

    approve({
      approvalId: approvalStatus.approval_id,
      executionProcessId,
    });
  }, [
    approvalStatus,
    executionProcessId,
    isApproving,
    feedbackContext,
    approve,
  ]);

  // Handle edit action - enter feedback mode
  const handleEdit = useCallback(() => {
    if (!approvalStatus || !executionProcessId || !feedbackContext) return;

    feedbackContext.enterFeedbackMode({
      approvalId: approvalStatus.approval_id,
      executionProcessId,
      timeoutAt: approvalStatus.timeout_at,
      requestedAt: approvalStatus.requested_at,
    });
  }, [approvalStatus, executionProcessId, feedbackContext]);

  return (
    <ChatPlan
      title={title}
      content={plan}
      expanded={expanded}
      onToggle={toggle}
      showActions={showActions}
      isTimedOut={isTimedOut}
      onApprove={showActions && !isTimedOut ? handleApprove : undefined}
      onEdit={
        showActions && !isTimedOut && feedbackContext ? handleEdit : undefined
      }
      workspaceId={workspaceId}
      status={status}
    />
  );
}

/**
 * User message entry with expandable content
 */
function UserMessageEntry({
  content,
  expansionKey,
  workspaceId,
  executionProcessId,
}: {
  content: string;
  expansionKey: string;
  workspaceId?: string;
  executionProcessId?: string;
}) {
  const [expanded, toggle] = useExpandable(`user:${expansionKey}`, true);
  const { startEdit, isEntryGreyed, isInEditMode } = useMessageEditContext();

  const isGreyed = isEntryGreyed(expansionKey);

  const handleEdit = useCallback(() => {
    if (executionProcessId) {
      startEdit(expansionKey, executionProcessId, content);
    }
  }, [startEdit, expansionKey, executionProcessId, content]);

  // Only show edit button if we have a process ID and not already in edit mode
  const canEdit = !!executionProcessId && !isInEditMode;

  return (
    <ChatUserMessage
      content={content}
      expanded={expanded}
      onToggle={toggle}
      workspaceId={workspaceId}
      onEdit={canEdit ? handleEdit : undefined}
      isGreyed={isGreyed}
    />
  );
}

/**
 * Assistant message entry with expandable content
 */
function AssistantMessageEntry({
  content,
  workspaceId,
}: {
  content: string;
  workspaceId?: string;
}) {
  return <ChatAssistantMessage content={content} workspaceId={workspaceId} />;
}

/**
 * Tool summary entry with collapsible content for multi-line summaries
 */
function ToolSummaryEntry({
  summary,
  expansionKey,
  status,
}: {
  summary: string;
  expansionKey: string;
  status: ToolStatus;
}) {
  const [expanded, toggle] = useExpandable(`tool:${expansionKey}`, false);

  return (
    <ChatToolSummary
      summary={summary}
      expanded={expanded}
      onToggle={toggle}
      status={status}
    />
  );
}

/**
 * Todo management entry with expandable list of todos
 */
function TodoManagementEntry({
  todos,
  expansionKey,
}: {
  todos: TodoItem[];
  expansionKey: string;
}) {
  const [expanded, toggle] = useExpandable(`todo:${expansionKey}`, false);

  return <ChatTodoList todos={todos} expanded={expanded} onToggle={toggle} />;
}

/**
 * System message entry with expandable content
 */
function SystemMessageEntry({
  content,
  expansionKey,
}: {
  content: string;
  expansionKey: string;
}) {
  const [expanded, toggle] = useExpandable(`system:${expansionKey}`, false);

  return (
    <ChatSystemMessage
      content={content}
      expanded={expanded}
      onToggle={toggle}
    />
  );
}

/**
 * Error message entry with expandable content
 */
function ErrorMessageEntry({
  content,
  expansionKey,
}: {
  content: string;
  expansionKey: string;
}) {
  const [expanded, toggle] = useExpandable(`error:${expansionKey}`, false);

  return (
    <ChatErrorMessage content={content} expanded={expanded} onToggle={toggle} />
  );
}

const NewDisplayConversationEntrySpaced = (props: Props) => {
  const { isEntryGreyed } = useMessageEditContext();
  const isGreyed = isEntryGreyed(props.expansionKey);

  return (
    <div
      className={cn(
        'my-base px-double',
        isGreyed && 'opacity-50 pointer-events-none'
      )}
    >
      <NewDisplayConversationEntry {...props} />
    </div>
  );
};

export default NewDisplayConversationEntrySpaced;
