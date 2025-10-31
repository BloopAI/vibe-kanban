import { useTranslation } from 'react-i18next';
import MarkdownRenderer from '@/components/ui/markdown-renderer.tsx';
import {
  ActionType,
  NormalizedEntry,
  TaskAttempt,
  ToolStatus,
  type NormalizedEntryType,
} from 'shared/types.ts';
import type { ProcessStartPayload } from '@/types/logs';
import FileChangeRenderer from './FileChangeRenderer';
import { useExpandable } from '@/stores/useExpandableStore';
import {
  AlertCircle,
  Bot,
  Brain,
  CheckSquare,
  ChevronDown,
  Hammer,
  Edit,
  Eye,
  Globe,
  Plus,
  Search,
  Settings,
  Terminal,
  User,
} from 'lucide-react';
import RawLogText from '../common/RawLogText';
import UserMessage from './UserMessage';
import PendingApprovalEntry from './PendingApprovalEntry';
import { NextActionCard } from './NextActionCard';
import { cn } from '@/lib/utils';
import { useRetryUi } from '@/contexts/RetryUiContext';

type Props = {
  entry: NormalizedEntry | ProcessStartPayload;
  expansionKey: string;
  diffDeletable?: boolean;
  executionProcessId?: string;
  taskAttempt?: TaskAttempt;
  task?: any;
};

type FileEditAction = Extract<ActionType, { action: 'file_edit' }>;
type JsonValue = any;

const renderJson = (v: JsonValue) => (
  <pre className="whitespace-pre-wrap">{JSON.stringify(v, null, 2)}</pre>
);

const getEntryIcon = (entryType: NormalizedEntryType) => {
  const iconSize = 'h-3 w-3';
  if (entryType.type === 'user_message' || entryType.type === 'user_feedback') {
    return <User className={iconSize} />;
  }
  if (entryType.type === 'assistant_message') {
    return <Bot className={iconSize} />;
  }
  if (entryType.type === 'system_message') {
    return <Settings className={iconSize} />;
  }
  if (entryType.type === 'thinking') {
    return <Brain className={iconSize} />;
  }
  if (entryType.type === 'error_message') {
    return <AlertCircle className={iconSize} />;
  }
  if (entryType.type === 'tool_use') {
    const { action_type, tool_name } = entryType;

    // Special handling for TODO tools
    if (
      action_type.action === 'todo_management' ||
      (tool_name &&
        (tool_name.toLowerCase() === 'todowrite' ||
          tool_name.toLowerCase() === 'todoread' ||
          tool_name.toLowerCase() === 'todo_write' ||
          tool_name.toLowerCase() === 'todo_read' ||
          tool_name.toLowerCase() === 'todo'))
    ) {
      return <CheckSquare className={iconSize} />;
    }

    if (action_type.action === 'file_read') {
      return <Eye className={iconSize} />;
    } else if (action_type.action === 'file_edit') {
      return <Edit className={iconSize} />;
    } else if (action_type.action === 'command_run') {
      return <Terminal className={iconSize} />;
    } else if (action_type.action === 'search') {
      return <Search className={iconSize} />;
    } else if (action_type.action === 'web_fetch') {
      return <Globe className={iconSize} />;
    } else if (action_type.action === 'task_create') {
      return <Plus className={iconSize} />;
    } else if (action_type.action === 'plan_presentation') {
      return <CheckSquare className={iconSize} />;
    } else if (action_type.action === 'tool') {
      return <Hammer className={iconSize} />;
    }
    return <Settings className={iconSize} />;
  }
  return <Settings className={iconSize} />;
};

type ExitStatusVisualisation = 'success' | 'error' | 'pending';

const getStatusIndicator = (entryType: NormalizedEntryType) => {
  let status_visualisation: ExitStatusVisualisation | null = null;
  if (
    entryType.type === 'tool_use' &&
    entryType.action_type.action === 'command_run'
  ) {
    status_visualisation = 'pending';
    if (entryType.action_type.result?.exit_status?.type === 'success') {
      if (entryType.action_type.result?.exit_status?.success) {
        status_visualisation = 'success';
      } else {
        status_visualisation = 'error';
      }
    } else if (
      entryType.action_type.result?.exit_status?.type === 'exit_code'
    ) {
      if (entryType.action_type.result?.exit_status?.code === 0) {
        status_visualisation = 'success';
      } else {
        status_visualisation = 'error';
      }
    }
  }

  // If pending, should be a pulsing primary-foreground
  const colorMap: Record<ExitStatusVisualisation, string> = {
    success: 'bg-green-300',
    error: 'bg-red-300',
    pending: 'bg-primary-foreground/50',
  };

  if (!status_visualisation) return null;

  return (
    <div className="relative">
      <div
        className={`${colorMap[status_visualisation]} h-1.5 w-1.5 rounded-full absolute -left-1 -bottom-4`}
      />
      {status_visualisation === 'pending' && (
        <div
          className={`${colorMap[status_visualisation]} h-1.5 w-1.5 rounded-full absolute -left-1 -bottom-4 animate-ping`}
        />
      )}
    </div>
  );
};

/**********************
 * Helper definitions *
 **********************/

const shouldRenderMarkdown = (entryType: NormalizedEntryType) =>
  entryType.type === 'assistant_message' ||
  entryType.type === 'system_message' ||
  entryType.type === 'thinking' ||
  entryType.type === 'tool_use';

const getContentClassName = (entryType: NormalizedEntryType) => {
  const base = ' whitespace-pre-wrap break-words';
  if (
    entryType.type === 'tool_use' &&
    entryType.action_type.action === 'command_run'
  )
    return `${base} font-mono`;

  // Keep content-only styling — no bg/padding/rounded here.
  if (entryType.type === 'error_message')
    return `${base} font-mono text-destructive`;

  if (entryType.type === 'thinking') return `${base} opacity-60`;

  if (
    entryType.type === 'tool_use' &&
    (entryType.action_type.action === 'todo_management' ||
      (entryType.tool_name &&
        ['todowrite', 'todoread', 'todo_write', 'todo_read', 'todo'].includes(
          entryType.tool_name.toLowerCase()
        )))
  )
    return `${base} font-mono text-zinc-800 dark:text-zinc-200`;

  if (
    entryType.type === 'tool_use' &&
    entryType.action_type.action === 'plan_presentation'
  )
    return `${base} text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/20 px-3 py-2 border-l-4 border-blue-400`;

  return base;
};

/*********************
 * Unified card      *
 *********************/

type CardVariant = 'system' | 'error';

const MessageCard: React.FC<{
  children: React.ReactNode;
  variant: CardVariant;
  expanded?: boolean;
  onToggle?: () => void;
}> = ({ children, variant, expanded, onToggle }) => {
  const frameBase =
    'border px-3 py-2 w-full cursor-pointer  bg-[hsl(var(--card))] border-[hsl(var(--border))]';
  const systemTheme = 'border-400/40 text-zinc-500';
  const errorTheme =
    'border-red-400/40 bg-red-50 dark:bg-[hsl(var(--card))] text-[hsl(var(--foreground))]';

  return (
    <div
      className={`${frameBase} ${
        variant === 'system' ? systemTheme : errorTheme
      }`}
      onClick={onToggle}
    >
      <div className="flex items-center gap-1.5">
        <div className="min-w-0 flex-1">{children}</div>
        {onToggle && (
          <ExpandChevron
            expanded={!!expanded}
            onClick={onToggle}
            variant={variant}
          />
        )}
      </div>
    </div>
  );
};

/************************
 * Collapsible container *
 ************************/

type CollapsibleVariant = 'system' | 'error';

const ExpandChevron: React.FC<{
  expanded: boolean;
  onClick: () => void;
  variant: CollapsibleVariant;
}> = ({ expanded, onClick, variant }) => {
  const color =
    variant === 'system'
      ? 'text-700 dark:text-300'
      : 'text-red-700 dark:text-red-300';

  return (
    <ChevronDown
      onClick={onClick}
      className={`h-4 w-4 cursor-pointer transition-transform ${color} ${
        expanded ? '' : '-rotate-90'
      }`}
    />
  );
};

const CollapsibleEntry: React.FC<{
  content: string;
  markdown: boolean;
  expansionKey: string;
  variant: CollapsibleVariant;
  contentClassName: string;
}> = ({ content, markdown, expansionKey, variant, contentClassName }) => {
  const multiline = content.includes('\n');
  const [expanded, toggle] = useExpandable(`entry:${expansionKey}`, false);

  const Inner = (
    <div className={contentClassName}>
      {markdown ? (
        <MarkdownRenderer
          content={content}
          className="whitespace-pre-wrap break-words"
          enableCopyButton={false}
        />
      ) : (
        content
      )}
    </div>
  );

  const firstLine = content.split('\n')[0];
  const PreviewInner = (
    <div className={contentClassName}>
      {markdown ? (
        <MarkdownRenderer
          content={firstLine}
          className="whitespace-pre-wrap break-words"
          enableCopyButton={false}
        />
      ) : (
        firstLine
      )}
    </div>
  );

  if (!multiline) {
    return <MessageCard variant={variant}>{Inner}</MessageCard>;
  }

  return expanded ? (
    <MessageCard variant={variant} expanded={expanded} onToggle={toggle}>
      {Inner}
    </MessageCard>
  ) : (
    <MessageCard variant={variant} expanded={expanded} onToggle={toggle}>
      {PreviewInner}
    </MessageCard>
  );
};

type ToolStatusAppearance = 'default' | 'denied' | 'timed_out';

const PLAN_APPEARANCE: Record<
  ToolStatusAppearance,
  {
    border: string;
    headerBg: string;
    headerText: string;
    contentBg: string;
    contentText: string;
  }
> = {
  default: {
    border: 'border-blue-400/40',
    headerBg: 'bg-blue-50 dark:bg-blue-950/20',
    headerText: 'text-blue-700 dark:text-blue-300',
    contentBg: 'bg-blue-50 dark:bg-blue-950/20',
    contentText: 'text-blue-700 dark:text-blue-300',
  },
  denied: {
    border: 'border-red-400/40',
    headerBg: 'bg-red-50 dark:bg-red-950/20',
    headerText: 'text-red-700 dark:text-red-300',
    contentBg: 'bg-red-50 dark:bg-red-950/10',
    contentText: 'text-red-700 dark:text-red-300',
  },
  timed_out: {
    border: 'border-amber-400/40',
    headerBg: 'bg-amber-50 dark:bg-amber-950/20',
    headerText: 'text-amber-700 dark:text-amber-200',
    contentBg: 'bg-amber-50 dark:bg-amber-950/10',
    contentText: 'text-amber-700 dark:text-amber-200',
  },
};

const PlanPresentationCard: React.FC<{
  plan: string;
  expansionKey: string;
  defaultExpanded?: boolean;
  statusAppearance?: ToolStatusAppearance;
}> = ({
  plan,
  expansionKey,
  defaultExpanded = false,
  statusAppearance = 'default',
}) => {
  const { t } = useTranslation('common');
  const [expanded, toggle] = useExpandable(
    `plan-entry:${expansionKey}`,
    defaultExpanded
  );
  const tone = PLAN_APPEARANCE[statusAppearance];

  return (
    <div className="inline-block w-full">
      <div
        className={cn('border w-full overflow-hidden rounded-sm', tone.border)}
      >
        <button
          onClick={(e: React.MouseEvent) => {
            e.preventDefault();
            toggle();
          }}
          title={
            expanded
              ? t('conversation.planToggle.hide')
              : t('conversation.planToggle.show')
          }
          className={cn(
            'w-full px-2 py-1.5 flex items-center gap-1.5 text-left border-b',
            tone.headerBg,
            tone.headerText,
            tone.border
          )}
        >
          <span className=" min-w-0 truncate">
            <span className="font-semibold">{t('conversation.plan')}</span>
          </span>
          <div className="ml-auto flex items-center gap-2">
            <ExpandChevron
              expanded={expanded}
              onClick={toggle}
              variant={statusAppearance === 'denied' ? 'error' : 'system'}
            />
          </div>
        </button>

        {expanded && (
          <div className={cn('px-3 py-2', tone.contentBg)}>
            <div className={cn('text-sm', tone.contentText)}>
              <MarkdownRenderer
                content={plan}
                className="whitespace-pre-wrap break-words"
                enableCopyButton
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const ToolCallCard: React.FC<{
  entryType?: Extract<NormalizedEntryType, { type: 'tool_use' }>;
  action?: any;
  expansionKey: string;
  content?: string;
  entryContent?: string;
  highlighted?: boolean;
  defaultExpanded?: boolean;
  statusAppearance?: ToolStatusAppearance;
  forceExpanded?: boolean;
}> = ({
  entryType,
  action,
  expansionKey,
  content,
  entryContent,
  defaultExpanded = false,
  forceExpanded = false,
}) => {
  const { t } = useTranslation('common');
  const at: any = entryType?.action_type || action;
  const [expanded, toggle] = useExpandable(
    `tool-entry:${expansionKey}`,
    defaultExpanded
  );
  const effectiveExpanded = forceExpanded || expanded;

  const label =
    at?.action === 'command_run'
      ? 'Ran'
      : entryType?.tool_name || at?.tool_name || 'Tool';

  const isCommand = at?.action === 'command_run';

  const inlineText = (entryContent || content || '').trim();
  const isSingleLine = inlineText !== '' && !/\r?\n/.test(inlineText);
  const showInlineSummary = isSingleLine;

  const hasArgs = at?.action === 'tool' && !!at?.arguments;
  const hasResult = at?.action === 'tool' && !!at?.result;

  const output: string | null = isCommand ? (at?.result?.output ?? null) : null;
  let argsText: string | null = null;
  if (isCommand) {
    const fromArgs =
      typeof at?.arguments === 'string'
        ? at.arguments
        : at?.arguments != null
          ? JSON.stringify(at.arguments, null, 2)
          : '';

    const fallback = (entryContent || content || '').trim();
    argsText = (fromArgs || fallback).trim();
  }

  const hasExpandableDetails = isCommand
    ? Boolean(argsText) || Boolean(output)
    : hasArgs || hasResult;

  const HeaderWrapper: React.ElementType = hasExpandableDetails
    ? 'button'
    : 'div';
  const headerProps = hasExpandableDetails
    ? {
        onClick: (e: React.MouseEvent) => {
          e.preventDefault();
          toggle();
        },
        title: effectiveExpanded
          ? t('conversation.toolDetailsToggle.hide')
          : t('conversation.toolDetailsToggle.show'),
      }
    : {};

  const headerClassName = cn(
    'w-full flex items-center gap-1.5 text-left text-secondary-foreground'
  );
  return (
    <div className="inline-block w-full flex flex-col gap-4">
      <HeaderWrapper {...headerProps} className={headerClassName}>
        <span className=" min-w-0 flex items-center gap-1.5">
          <span>
            {entryType && getStatusIndicator(entryType)}
            {entryType && getEntryIcon(entryType)}
          </span>
          {showInlineSummary ? (
            <span className="font-light">{inlineText}</span>
          ) : (
            <span className="font-normal">{label}</span>
          )}
        </span>
      </HeaderWrapper>

      {effectiveExpanded && (
        <div className="max-h-[200px] overflow-y-auto border">
          {isCommand ? (
            <>
              {argsText && (
                <>
                  <div className="font-normal uppercase bg-background border-b border-dashed px-2 py-1">
                    {t('conversation.args')}
                  </div>
                  <div className="px-2 py-1">{argsText}</div>
                </>
              )}

              {output && (
                <>
                  <div className="font-normal uppercase bg-background border-y border-dashed px-2 py-1">
                    {t('conversation.output')}
                  </div>
                  <div className="px-2 py-1">
                    <RawLogText content={output} />
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              {entryType?.action_type.action === 'tool' && (
                <>
                  <div className="font-normal uppercase bg-background border-b border-dashed px-2 py-1">
                    {t('conversation.args')}
                  </div>
                  <div className="px-2 py-1">
                    {renderJson(entryType.action_type.arguments)}
                  </div>
                  <div className="font-normal uppercase bg-background border-y border-dashed px-2 py-1">
                    {t('conversation.result')}
                  </div>
                  <div className="px-2 py-1">
                    {entryType.action_type.result?.type.type === 'markdown' &&
                      entryType.action_type.result.value && (
                        <MarkdownRenderer
                          content={entryType.action_type.result.value?.toString()}
                        />
                      )}
                    {entryType.action_type.result?.type.type === 'json' &&
                      renderJson(entryType.action_type.result.value)}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

const LoadingCard = () => {
  return (
    <div className="flex animate-pulse space-x-2 items-center">
      <div className="size-3 bg-foreground/10"></div>
      <div className="flex-1 h-3 bg-foreground/10"></div>
      <div className="flex-1 h-3"></div>
      <div className="flex-1 h-3"></div>
    </div>
  );
};

const isPendingApprovalStatus = (
  status: ToolStatus
): status is Extract<ToolStatus, { status: 'pending_approval' }> =>
  status.status === 'pending_approval';

const getToolStatusAppearance = (status: ToolStatus): ToolStatusAppearance => {
  if (status.status === 'denied') return 'denied';
  if (status.status === 'timed_out') return 'timed_out';
  return 'default';
};

/*******************
 * Main component  *
 *******************/

export const DisplayConversationEntryMaxWidth = (props: Props) => {
  return (
    <div className="mx-auto w-full max-w-[50rem]">
      <DisplayConversationEntry {...props} />
    </div>
  );
};

function DisplayConversationEntry({
  entry,
  expansionKey,
  executionProcessId,
  taskAttempt,
  task,
}: Props) {
  const { t } = useTranslation('common');
  const isNormalizedEntry = (
    entry: NormalizedEntry | ProcessStartPayload
  ): entry is NormalizedEntry => 'entry_type' in entry;

  const isProcessStart = (
    entry: NormalizedEntry | ProcessStartPayload
  ): entry is ProcessStartPayload => 'processId' in entry;

  const { isProcessGreyed } = useRetryUi();
  const greyed = isProcessGreyed(executionProcessId);

  if (isProcessStart(entry)) {
    const toolAction: any = entry.action ?? null;
    return (
      <div className={greyed ? 'opacity-50 pointer-events-none' : undefined}>
        <ToolCallCard
          action={toolAction}
          expansionKey={expansionKey}
          content={toolAction?.message ?? toolAction?.summary ?? undefined}
        />
      </div>
    );
  }

  // Handle NormalizedEntry
  const entryType = entry.entry_type;
  const isSystem = entryType.type === 'system_message';
  const isError = entryType.type === 'error_message';
  const isToolUse = entryType.type === 'tool_use';
  const isUserMessage = entryType.type === 'user_message';
  const isUserFeedback = entryType.type === 'user_feedback';
  const isLoading = entryType.type === 'loading';
  const isFileEdit = (a: ActionType): a is FileEditAction =>
    a.action === 'file_edit';

  if (isUserMessage) {
    return (
      <UserMessage
        content={entry.content}
        executionProcessId={executionProcessId}
        taskAttempt={taskAttempt}
      />
    );
  }

  if (isUserFeedback) {
    const feedbackEntry = entryType as Extract<
      NormalizedEntryType,
      { type: 'user_feedback' }
    >;
    return (
      <div className="py-2">
        <div className="bg-background px-4 py-2 text-sm border-y border-dashed">
          <div
            className="text-xs mb-1 opacity-70"
            style={{ color: 'hsl(var(--destructive))' }}
          >
            {t('conversation.deniedByUser', {
              toolName: feedbackEntry.denied_tool,
            })}
          </div>
          <MarkdownRenderer
            content={entry.content}
            className="whitespace-pre-wrap break-words flex flex-col gap-1 font-light py-3"
          />
        </div>
      </div>
    );
  }
  const renderToolUse = () => {
    if (!isNormalizedEntry(entry)) return null;
    if (entryType.type !== 'tool_use') return null;
    const toolEntry = entryType;

    const status = toolEntry.status;
    const statusAppearance = getToolStatusAppearance(status);
    const isPlanPresentation =
      toolEntry.action_type.action === 'plan_presentation';
    const isPendingApproval = status.status === 'pending_approval';
    const defaultExpanded = isPendingApproval || isPlanPresentation;

    const body = (() => {
      if (isFileEdit(toolEntry.action_type)) {
        const fileEditAction = toolEntry.action_type as FileEditAction;
        return (
          <div className="space-y-3">
            {fileEditAction.changes.map((change, idx) => (
              <FileChangeRenderer
                key={idx}
                path={fileEditAction.path}
                change={change}
                expansionKey={`edit:${expansionKey}:${idx}`}
                defaultExpanded={defaultExpanded}
                statusAppearance={statusAppearance}
                forceExpanded={isPendingApproval}
              />
            ))}
          </div>
        );
      }

      if (toolEntry.action_type.action === 'plan_presentation') {
        return (
          <PlanPresentationCard
            plan={toolEntry.action_type.plan}
            expansionKey={expansionKey}
            defaultExpanded={defaultExpanded}
            statusAppearance={statusAppearance}
          />
        );
      }

      return (
        <ToolCallCard
          entryType={toolEntry}
          expansionKey={expansionKey}
          entryContent={entry.content}
          defaultExpanded={defaultExpanded}
          statusAppearance={statusAppearance}
          forceExpanded={isPendingApproval}
        />
      );
    })();

    const content = (
      <div
        className={`px-4 py-2 text-sm space-y-3 ${greyed ? 'opacity-50 pointer-events-none' : ''}`}
      >
        {body}
      </div>
    );

    if (isPendingApprovalStatus(status)) {
      return (
        <PendingApprovalEntry
          pendingStatus={status}
          executionProcessId={executionProcessId}
        >
          {content}
        </PendingApprovalEntry>
      );
    }

    return content;
  };

  if (isToolUse) {
    return renderToolUse();
  }

  if (isSystem || isError) {
    return (
      <div
        className={`px-4 py-2 text-sm ${greyed ? 'opacity-50 pointer-events-none' : ''}`}
      >
        <CollapsibleEntry
          content={isNormalizedEntry(entry) ? entry.content : ''}
          markdown={shouldRenderMarkdown(entryType)}
          expansionKey={expansionKey}
          variant={isSystem ? 'system' : 'error'}
          contentClassName={getContentClassName(entryType)}
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="px-4 py-2 text-sm">
        <LoadingCard />
      </div>
    );
  }

  if (entry.entry_type.type === 'next_action') {
    return (
      <div className="px-4 py-2 text-sm">
        <NextActionCard
          attemptId={taskAttempt?.id}
          containerRef={taskAttempt?.container_ref}
          failed={entry.entry_type.failed}
          execution_processes={entry.entry_type.execution_processes}
          task={task}
        />
      </div>
    );
  }

  return (
    <div className="px-4 py-2 text-sm">
      <div className={getContentClassName(entryType)}>
        {shouldRenderMarkdown(entryType) ? (
          <MarkdownRenderer
            content={isNormalizedEntry(entry) ? entry.content : ''}
            className="whitespace-pre-wrap break-words flex flex-col gap-1 font-light"
            enableCopyButton={entryType.type === 'assistant_message'}
          />
        ) : isNormalizedEntry(entry) ? (
          entry.content
        ) : (
          ''
        )}
      </div>
    </div>
  );
}

export default DisplayConversationEntryMaxWidth;
