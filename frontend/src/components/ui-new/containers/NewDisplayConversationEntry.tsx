import { useMemo, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  ActionType,
  NormalizedEntry,
  ToolStatus,
  TodoItem,
  type RepoWithTargetBranch,
} from 'shared/types';
import type { WorkspaceWithSession } from '@/types/attempt';
import { DiffLineType, parseInstance } from '@git-diff-view/react';
import {
  usePersistedExpanded,
  type PersistKey,
} from '@/stores/useUiPreferencesStore';
import DisplayConversationEntry from '@/components/NormalizedConversation/DisplayConversationEntry';
import { useMessageEditContext } from '@/contexts/MessageEditContext';
import { useChangesView } from '@/contexts/ChangesViewContext';
import { useLogsPanel } from '@/contexts/LogsPanelContext';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { cn } from '@/lib/utils';
import {
  ScriptFixerDialog,
  type ScriptType,
} from '@/components/dialogs/scripts/ScriptFixerDialog';
import { ChatToolSummary } from '../primitives/conversation/ChatToolSummary';
import { ChatTodoList } from '../primitives/conversation/ChatTodoList';
import { ChatFileEntry } from '../primitives/conversation/ChatFileEntry';
import { ChatApprovalCard } from '../primitives/conversation/ChatApprovalCard';
import { ChatUserMessage } from '../primitives/conversation/ChatUserMessage';
import { ChatAssistantMessage } from '../primitives/conversation/ChatAssistantMessage';
import { ChatSystemMessage } from '../primitives/conversation/ChatSystemMessage';
import { ChatThinkingMessage } from '../primitives/conversation/ChatThinkingMessage';
import { ChatErrorMessage } from '../primitives/conversation/ChatErrorMessage';
import { ChatScriptEntry } from '../primitives/conversation/ChatScriptEntry';
import type { DiffInput } from '../primitives/conversation/DiffViewCard';

type Props = {
  entry: NormalizedEntry;
  expansionKey: string;
  executionProcessId: string;
  taskAttempt: WorkspaceWithSession;
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
  entryType: Extract<NormalizedEntry['entry_type'], { type: 'tool_use' }>,
  t: TFunction<'common'>
): string {
  const { action_type, tool_name } = entryType;

  switch (action_type.action) {
    case 'file_read':
      return t('conversation.toolSummary.read', { path: action_type.path });
    case 'search':
      return t('conversation.toolSummary.searched', {
        query: action_type.query,
      });
    case 'web_fetch':
      return t('conversation.toolSummary.fetched', { url: action_type.url });
    case 'command_run':
      return action_type.command || t('conversation.toolSummary.ranCommand');
    case 'task_create':
      return t('conversation.toolSummary.createdTask', {
        description: action_type.description,
      });
    case 'todo_management':
      return t('conversation.toolSummary.todoOperation', {
        operation: action_type.operation,
      });
    case 'tool':
      return tool_name || t('conversation.tool');
    default:
      return tool_name || t('conversation.tool');
  }
}

/**
 * Extract the actual tool output from action_type.result
 * The output location depends on the action type:
 * - command_run: result.output
 * - tool: result.value (JSON stringified if object)
 * - others: fall back to entry.content
 */
function getToolOutput(
  entryType: Extract<NormalizedEntry['entry_type'], { type: 'tool_use' }>,
  entryContent: string
): string {
  const { action_type } = entryType;

  switch (action_type.action) {
    case 'command_run':
      return action_type.result?.output ?? entryContent;
    case 'tool':
      if (action_type.result?.value != null) {
        return typeof action_type.result.value === 'string'
          ? action_type.result.value
          : JSON.stringify(action_type.result.value, null, 2);
      }
      return entryContent;
    default:
      return entryContent;
  }
}

/**
 * Extract the command from action_type for command_run actions
 */
function getToolCommand(
  entryType: Extract<NormalizedEntry['entry_type'], { type: 'tool_use' }>
): string | undefined {
  const { action_type } = entryType;

  if (action_type.action === 'command_run') {
    return action_type.command;
  }
  return undefined;
}

/**
 * Render tool_use entry types with appropriate components
 */
function renderToolUseEntry(
  entryType: Extract<NormalizedEntry['entry_type'], { type: 'tool_use' }>,
  props: Props,
  t: TFunction<'common'>
): React.ReactNode {
  const { expansionKey, executionProcessId, taskAttempt } = props;
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

  // Plan presentation - use ChatApprovalCard
  if (action_type.action === 'plan_presentation') {
    return (
      <PlanEntry
        plan={action_type.plan}
        expansionKey={expansionKey}
        workspaceId={taskAttempt?.id}
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

  // Script entries (Setup Script, Cleanup Script, Tool Install Script)
  const scriptToolNames = [
    'Setup Script',
    'Cleanup Script',
    'Tool Install Script',
  ];
  if (
    action_type.action === 'command_run' &&
    scriptToolNames.includes(entryType.tool_name)
  ) {
    const exitCode =
      action_type.result?.exit_status?.type === 'exit_code'
        ? action_type.result.exit_status.code
        : null;

    return (
      <ScriptEntryWithFix
        title={entryType.tool_name}
        processId={executionProcessId ?? ''}
        exitCode={exitCode}
        status={status}
        workspaceId={taskAttempt?.id}
        sessionId={taskAttempt?.session?.id}
      />
    );
  }

  // Generic tool pending approval - use plan-style card
  if (status.status === 'pending_approval') {
    return (
      <GenericToolApprovalEntry
        toolName={entryType.tool_name}
        content={props.entry.content}
        expansionKey={expansionKey}
        workspaceId={taskAttempt?.id}
        status={status}
      />
    );
  }

  // Other tool uses - use ChatToolSummary
  return (
    <ToolSummaryEntry
      summary={getToolSummary(entryType, t)}
      expansionKey={expansionKey}
      status={status}
      content={getToolOutput(entryType, props.entry.content)}
      toolName={entryType.tool_name}
      command={getToolCommand(entryType)}
    />
  );
}

function NewDisplayConversationEntry(props: Props) {
  const { t } = useTranslation('common');
  const { entry, expansionKey, executionProcessId, taskAttempt } = props;
  const entryType = entry.entry_type;

  switch (entryType.type) {
    case 'tool_use':
      return renderToolUseEntry(entryType, props, t);

    case 'user_message':
      return (
        <UserMessageEntry
          content={entry.content}
          expansionKey={expansionKey}
          workspaceId={taskAttempt?.id}
          executionProcessId={executionProcessId}
        />
      );

    case 'assistant_message':
      return (
        <AssistantMessageEntry
          content={entry.content}
          workspaceId={taskAttempt?.id}
        />
      );

    case 'system_message':
      return (
        <SystemMessageEntry
          content={entry.content}
          expansionKey={expansionKey}
        />
      );

    case 'thinking':
      return (
        <ChatThinkingMessage
          content={entry.content}
          taskAttemptId={taskAttempt?.id}
        />
      );

    case 'error_message':
      return (
        <ErrorMessageEntry
          content={entry.content}
          expansionKey={expansionKey}
        />
      );

    case 'next_action':
      // The new design doesn't need the next action bar
      return null;

    case 'token_usage_info':
      // Displayed in the chat header as the context-usage gauge
      return null;

    case 'user_feedback':
    case 'loading':
      // Fallback to legacy component for these entry types
      return (
        <DisplayConversationEntry
          entry={entry}
          expansionKey={expansionKey}
          executionProcessId={executionProcessId}
          taskAttempt={taskAttempt}
        />
      );

    default: {
      // Exhaustive check - TypeScript will error if a case is missing
      const _exhaustiveCheck: never = entryType;
      return _exhaustiveCheck;
    }
  }
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
  // Auto-expand when pending approval
  const pendingApproval = status.status === 'pending_approval';
  const [expanded, toggle] = usePersistedExpanded(
    expansionKey as PersistKey,
    pendingApproval
  );
  const { viewFileInChanges, diffPaths } = useChangesView();

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

  // Build diff content for rendering when expanded
  const diffContent: DiffInput | undefined = useMemo(() => {
    if (change.action === 'edit' && change.unified_diff) {
      return {
        type: 'unified',
        path,
        unifiedDiff: change.unified_diff,
        hasLineNumbers: change.has_line_numbers ?? true,
      };
    }
    // For write actions, use content-based diff (empty old, new content)
    if (change.action === 'write' && change.content) {
      return {
        type: 'content',
        oldContent: '',
        newContent: change.content,
        newPath: path,
      };
    }
    return undefined;
  }, [change, path]);

  // Only show "open in changes" button if the file exists in current diffs
  const handleOpenInChanges = useCallback(() => {
    viewFileInChanges(path);
  }, [viewFileInChanges, path]);

  const canOpenInChanges = diffPaths.has(path);

  return (
    <ChatFileEntry
      filename={path}
      additions={additions ?? writeAdditions}
      deletions={deletions}
      expanded={expanded}
      onToggle={toggle}
      status={status}
      diffContent={diffContent}
      onOpenInChanges={canOpenInChanges ? handleOpenInChanges : undefined}
    />
  );
}

/**
 * Plan entry with expandable content
 */
function PlanEntry({
  plan,
  expansionKey,
  workspaceId,
  status,
}: {
  plan: string;
  expansionKey: string;
  workspaceId: string | undefined;
  status: ToolStatus;
}) {
  const { t } = useTranslation('common');
  // Expand plans by default when pending approval
  const pendingApproval = status.status === 'pending_approval';
  const [expanded, toggle] = usePersistedExpanded(
    `plan:${expansionKey}`,
    pendingApproval
  );

  // Extract title from plan content (first line or default)
  const title = useMemo(() => {
    const firstLine = plan.split('\n')[0];
    // Remove markdown heading markers
    const cleanTitle = firstLine.replace(/^#+\s*/, '').trim();
    return cleanTitle || t('conversation.plan');
  }, [plan, t]);

  return (
    <ChatApprovalCard
      title={title}
      content={plan}
      expanded={expanded}
      onToggle={toggle}
      workspaceId={workspaceId}
      status={status}
    />
  );
}

/**
 * Generic tool approval entry - renders with plan-style card when pending approval
 */
function GenericToolApprovalEntry({
  toolName,
  content,
  expansionKey,
  workspaceId,
  status,
}: {
  toolName: string;
  content: string;
  expansionKey: string;
  workspaceId: string | undefined;
  status: ToolStatus;
}) {
  const [expanded, toggle] = usePersistedExpanded(
    `tool:${expansionKey}`,
    true // auto-expand for pending approval
  );

  return (
    <ChatApprovalCard
      title={toolName}
      content={content}
      expanded={expanded}
      onToggle={toggle}
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
  workspaceId: string | undefined;
  executionProcessId: string | undefined;
}) {
  const [expanded, toggle] = usePersistedExpanded(`user:${expansionKey}`, true);
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
  workspaceId: string | undefined;
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
  content,
  toolName,
  command,
}: {
  summary: string;
  expansionKey: string;
  status: ToolStatus;
  content: string;
  toolName: string;
  command: string | undefined;
}) {
  const [expanded, toggle] = usePersistedExpanded(
    `tool:${expansionKey}`,
    false
  );
  const { viewToolContentInPanel } = useLogsPanel();
  const textRef = useRef<HTMLSpanElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useLayoutEffect(() => {
    const el = textRef.current;
    if (el && !expanded) {
      setIsTruncated(el.scrollWidth > el.clientWidth);
    }
  }, [summary, expanded]);

  // Any tool with output can open the logs panel
  const hasOutput = content && content.trim().length > 0;

  const handleViewContent = useCallback(() => {
    viewToolContentInPanel(toolName, content, command);
  }, [viewToolContentInPanel, toolName, content, command]);

  return (
    <ChatToolSummary
      ref={textRef}
      summary={summary}
      expanded={expanded}
      onToggle={toggle}
      status={status}
      onViewContent={hasOutput ? handleViewContent : undefined}
      toolName={toolName}
      isTruncated={isTruncated}
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
  const [expanded, toggle] = usePersistedExpanded(
    `todo:${expansionKey}`,
    false
  );

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
  const [expanded, toggle] = usePersistedExpanded(
    `system:${expansionKey}`,
    false
  );

  return (
    <ChatSystemMessage
      content={content}
      expanded={expanded}
      onToggle={toggle}
    />
  );
}

/**
 * Script entry with fix button for failed scripts
 */
function ScriptEntryWithFix({
  title,
  processId,
  exitCode,
  status,
  workspaceId,
  sessionId,
}: {
  title: string;
  processId: string;
  exitCode: number | null;
  status: ToolStatus;
  workspaceId: string | undefined;
  sessionId: string | undefined;
}) {
  // Try to get repos from workspace context - may not be available in all contexts
  let repos: RepoWithTargetBranch[] = [];
  try {
    const workspaceContext = useWorkspaceContext();
    repos = workspaceContext.repos;
  } catch {
    // Context not available, fix button won't be shown
  }

  // Use ref to access current repos without causing callback recreation
  const reposRef = useRef(repos);
  reposRef.current = repos;

  const handleFix = useCallback(() => {
    const currentRepos = reposRef.current;
    if (!workspaceId || currentRepos.length === 0) return;

    // Determine script type based on title
    const scriptType: ScriptType =
      title === 'Setup Script'
        ? 'setup'
        : title === 'Cleanup Script'
          ? 'cleanup'
          : 'dev_server';

    ScriptFixerDialog.show({
      scriptType,
      repos: currentRepos,
      workspaceId,
      sessionId,
      initialRepoId: currentRepos.length === 1 ? currentRepos[0].id : undefined,
    });
  }, [title, workspaceId, sessionId]);

  // Only show fix button if we have the necessary context
  const canFix = workspaceId && repos.length > 0;

  return (
    <ChatScriptEntry
      title={title}
      processId={processId}
      exitCode={exitCode}
      status={status}
      onFix={canFix ? handleFix : undefined}
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
  const [expanded, toggle] = usePersistedExpanded(
    `error:${expansionKey}`,
    false
  );

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
