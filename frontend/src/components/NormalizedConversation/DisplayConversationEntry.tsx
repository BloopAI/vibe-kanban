import { useTranslation } from 'react-i18next';
import MarkdownRenderer from '@/components/ui/markdown-renderer.tsx';
import {
  ActionType,
  NormalizedEntry,
  TaskAttempt,
  ToolStatus,
  type NormalizedEntryType,
  type TaskWithAttemptStatus,
  type JsonValue,
  type ExecutionProcess,
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
  Clock,
  ExternalLink,
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
import { useUserSystem } from '@/components/ConfigProvider';
import RawLogText from '../common/RawLogText';
import UserMessage from './UserMessage';
import PendingApprovalEntry from './PendingApprovalEntry';
import PendingQuestionEntry from './PendingQuestionEntry';
import { NextActionCard } from './NextActionCard';
import { ResultMessageCard } from './ResultMessageCard';
import { cn } from '@/lib/utils';
import { useRetryUi } from '@/contexts/RetryUiContext';
import { useExecutionProcessesContext } from '@/contexts/ExecutionProcessesContext';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  shouldShowViewButton,
  getFilePreviewRouting,
} from '@/utils/fileHelpers';
import { useFileViewer } from '@/contexts/FileViewerContext';

type Props = {
  entry: NormalizedEntry | ProcessStartPayload;
  expansionKey: string;
  diffDeletable?: boolean;
  executionProcessId?: string;
  taskAttempt?: TaskAttempt;
  task?: TaskWithAttemptStatus;
};

type FileEditAction = Extract<ActionType, { action: 'file_edit' }>;

/**
 * Extract executor variant from execution process data.
 * Only CodingAgentInitialRequest and CodingAgentFollowUpRequest types have variants.
 * Returns null if no variant is present.
 *
 * Currently used for displaying executor variant in UserMessage headers when available.
 */
const getExecutorVariant = (execProcess?: ExecutionProcess): string | null => {
  if (!execProcess?.executor_action?.typ) return null;
  const typ = execProcess.executor_action.typ;
  if (
    typ.type === 'CodingAgentInitialRequest' ||
    typ.type === 'CodingAgentFollowUpRequest'
  ) {
    return typ.executor_profile_id?.variant ?? null;
  }
  return null;
};

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
  entry: NormalizedEntry | ProcessStartPayload;
  expansionKey: string;
  forceExpanded?: boolean;
  attemptId?: string;
}> = ({ entry, expansionKey, forceExpanded = false, attemptId }) => {
  const { t } = useTranslation('common');
  const { openFile } = useFileViewer();

  // Determine if this is a NormalizedEntry with tool_use
  const isNormalizedEntry = 'entry_type' in entry;
  const entryType =
    isNormalizedEntry && entry.entry_type.type === 'tool_use'
      ? entry.entry_type
      : undefined;

  // Compute defaults from entry
  const linkifyUrls = entryType?.tool_name === 'Tool Install Script';
  const defaultExpanded = linkifyUrls;

  const [expanded, toggle] = useExpandable(
    `tool-entry:${expansionKey}`,
    defaultExpanded
  );
  const effectiveExpanded = forceExpanded || expanded;

  // Extract action details
  const actionType = entryType?.action_type;
  const isCommand = actionType?.action === 'command_run';
  const isTool = actionType?.action === 'tool';

  // Label and content
  const label = isCommand ? 'Ran' : entryType?.tool_name || 'Tool';

  const inlineText = isNormalizedEntry ? entry.content.trim() : '';
  const isSingleLine = inlineText !== '' && !/\r?\n/.test(inlineText);
  const showInlineSummary = isSingleLine;

  // Command details
  const commandResult = isCommand ? actionType.result : null;
  const output = commandResult?.output ?? null;
  let argsText: string | null = null;
  if (isCommand) {
    const fromArgs =
      typeof actionType.command === 'string' ? actionType.command : '';
    const fallback = inlineText;
    argsText = (fromArgs || fallback).trim();
  }

  // Tool details
  const hasArgs = isTool && !!actionType.arguments;
  const hasResult = isTool && !!actionType.result;

  // File read with path detection for view file link
  const isFileRead = actionType?.action === 'file_read';
  const fileReadPath = isFileRead ? actionType.path : null;

  // Show view button for .claude/ files or any markdown file
  const showViewButton = fileReadPath && shouldShowViewButton(fileReadPath);

  const handleViewFile = () => {
    if (!fileReadPath) return;
    const routing = getFilePreviewRouting({ path: fileReadPath, attemptId });
    if (routing) {
      openFile(routing);
    }
  };

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
        <span className="min-w-0 flex items-center gap-1.5">
          <span>
            {entryType && getStatusIndicator(entryType)}
            {entryType && getEntryIcon(entryType)}
          </span>
          {showInlineSummary ? (
            <span className="font-light inline-flex items-center gap-1">
              {inlineText}
              {/* View file link for .claude/ paths or markdown files */}
              {showViewButton && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewFile();
                        }}
                        className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors p-0.5"
                        aria-label="View file"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>View file</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </span>
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
                    <RawLogText content={output} linkifyUrls={linkifyUrls} />
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              {isTool && actionType && (
                <>
                  <div className="font-normal uppercase bg-background border-b border-dashed px-2 py-1">
                    {t('conversation.args')}
                  </div>
                  <div className="px-2 py-1">
                    {renderJson(actionType.arguments)}
                  </div>
                  <div className="font-normal uppercase bg-background border-y border-dashed px-2 py-1">
                    {t('conversation.result')}
                  </div>
                  <div className="px-2 py-1">
                    {actionType.result?.type.type === 'markdown' &&
                      actionType.result.value && (
                        <MarkdownRenderer
                          content={actionType.result.value?.toString()}
                        />
                      )}
                    {actionType.result?.type.type === 'json' &&
                      renderJson(actionType.result.value)}
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

/**
 * Format duration in seconds to a human-readable string
 */
const formatDuration = (seconds: number): string => {
  if (seconds < 60) {
    return `${seconds} second${seconds !== 1 ? 's' : ''}`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    if (remainingSeconds === 0) {
      return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    }
    return `${minutes}m ${remainingSeconds}s`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (remainingMinutes === 0) {
    return `${hours} hour${hours !== 1 ? 's' : ''}`;
  }
  return `${hours}h ${remainingMinutes}m`;
};

/**
 * Format an ISO timestamp to a display string based on configured timezone
 */
const formatTimestamp = (isoString: string, timezone: string): string => {
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;

    const options: Intl.DateTimeFormatOptions = {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour12: false,
    };

    // If timezone is "LOCAL", use browser's default (undefined)
    if (timezone !== 'LOCAL') {
      options.timeZone = timezone;
    }

    return new Intl.DateTimeFormat('en-GB', options).format(date);
  } catch {
    return isoString;
  }
};

/**
 * IRC-style execution boundary marker component
 */
const ExecutionMarker: React.FC<{
  type: 'start' | 'end';
  processName: string;
  startedAt: string;
  endedAt?: string;
  durationSeconds?: number;
  status?: string;
}> = ({ type, processName, startedAt, endedAt, durationSeconds, status }) => {
  const { config } = useUserSystem();
  const timezone = config?.timestamps?.timezone ?? 'LOCAL';

  const formattedStartTime = formatTimestamp(startedAt, timezone);
  const formattedEndTime = endedAt ? formatTimestamp(endedAt, timezone) : '';

  const statusLabel = status ? ` (${status})` : '';
  const durationLabel =
    durationSeconds !== undefined
      ? ` - ${formatDuration(durationSeconds)}`
      : '';

  return (
    <div className="px-4 py-1.5 text-xs font-mono text-muted-foreground flex items-center gap-2">
      <Clock className="h-3 w-3" />
      {type === 'start' ? (
        <span>
          {processName} started at {formattedStartTime}
        </span>
      ) : (
        <span>
          {processName} finished at {formattedEndTime}
          {durationLabel}
          {statusLabel}
        </span>
      )}
    </div>
  );
};

const isPendingApprovalStatus = (
  status: ToolStatus
): status is Extract<ToolStatus, { status: 'pending_approval' }> =>
  status.status === 'pending_approval';

const isPendingQuestionStatus = (
  status: ToolStatus
): status is Extract<ToolStatus, { status: 'pending_question' }> =>
  status.status === 'pending_question';

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
  const { executionProcessesByIdAll } = useExecutionProcessesContext();
  const isNormalizedEntry = (
    entry: NormalizedEntry | ProcessStartPayload
  ): entry is NormalizedEntry => 'entry_type' in entry;

  const isProcessStart = (
    entry: NormalizedEntry | ProcessStartPayload
  ): entry is ProcessStartPayload => 'processId' in entry;

  const { isProcessGreyed } = useRetryUi();
  const greyed = isProcessGreyed(executionProcessId);

  if (isProcessStart(entry)) {
    return (
      <div className={greyed ? 'opacity-50 pointer-events-none' : undefined}>
        <ToolCallCard
          entry={entry}
          expansionKey={expansionKey}
          attemptId={taskAttempt?.id}
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
        executorVariant={getExecutorVariant(
          executionProcessId
            ? executionProcessesByIdAll[executionProcessId]
            : undefined
        )}
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
    const isPendingQuestion = status.status === 'pending_question';
    const defaultExpanded =
      isPendingApproval || isPendingQuestion || isPlanPresentation;

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
                forceExpanded={isPendingApproval || isPendingQuestion}
                attemptId={taskAttempt?.id}
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
          entry={entry}
          expansionKey={expansionKey}
          forceExpanded={isPendingApproval || isPendingQuestion}
          attemptId={taskAttempt?.id}
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
      // Extract tool arguments for debug display (especially for AskUserQuestion)
      const toolArgs =
        toolEntry.action_type.action === 'tool'
          ? toolEntry.action_type.arguments
          : undefined;

      return (
        <PendingApprovalEntry
          pendingStatus={status}
          executionProcessId={executionProcessId}
          toolName={toolEntry.tool_name}
          toolArguments={toolArgs}
        >
          {content}
        </PendingApprovalEntry>
      );
    }

    if (isPendingQuestionStatus(status)) {
      return (
        <PendingQuestionEntry
          pendingStatus={status}
          executionProcessId={executionProcessId}
        >
          {content}
        </PendingQuestionEntry>
      );
    }

    // Show "User selected:" for answered questions
    if (status.status === 'answered' && status.answers) {
      const answerEntries = Object.entries(status.answers).filter(
        ([, value]) => value !== undefined && value !== ''
      );

      if (answerEntries.length > 0) {
        return (
          <>
            {content}
            <div className="px-4 py-2 text-muted-foreground text-sm">
              <div className="font-medium mb-1">User selected:</div>
              {answerEntries.map(([question, answer]) => (
                <div key={question} className="ml-2">
                  • {answer}
                </div>
              ))}
            </div>
          </>
        );
      }
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
          needsSetup={entry.entry_type.needs_setup}
        />
      </div>
    );
  }

  // Handle execution boundary markers
  if (entry.entry_type.type === 'execution_start') {
    const startEntry = entry.entry_type;
    return (
      <ExecutionMarker
        type="start"
        processName={startEntry.process_name}
        startedAt={startEntry.started_at}
      />
    );
  }

  if (entry.entry_type.type === 'execution_end') {
    const endEntry = entry.entry_type;
    return (
      <ExecutionMarker
        type="end"
        processName={endEntry.process_name}
        startedAt={endEntry.started_at}
        endedAt={endEntry.ended_at}
        durationSeconds={Number(endEntry.duration_seconds)}
        status={endEntry.status}
      />
    );
  }

  if (entry.entry_type.type === 'token_usage') {
    const tu = entry.entry_type;
    const fmtNum = (n: bigint) =>
      Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
    const pct =
      tu.context_window && tu.context_window > 0n
        ? Math.min(
            100,
            Math.round((Number(tu.input_tokens + tu.output_tokens) / Number(tu.context_window)) * 100)
          )
        : null;

    return (
      <div className="px-4 py-1.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground font-mono">
          <span title={t('conversation.tokenUsage.inputTitle')}>↓ {fmtNum(tu.input_tokens)}</span>
          {tu.cached_input_tokens > 0n && (
            <span title={t('conversation.tokenUsage.cachedTitle')} className="opacity-60">
              {t('conversation.tokenUsage.cache')} {fmtNum(tu.cached_input_tokens)}
            </span>
          )}
          <span title={t('conversation.tokenUsage.outputTitle')}>↑ {fmtNum(tu.output_tokens)}</span>
          {tu.reasoning_tokens > 0n && (
            <span title={t('conversation.tokenUsage.reasoningTitle')} className="opacity-60">
              {t('conversation.tokenUsage.think')} {fmtNum(tu.reasoning_tokens)}
            </span>
          )}
          <span title={t('conversation.tokenUsage.lastTitle')} className="opacity-70">
            {t('conversation.tokenUsage.last')} {fmtNum(tu.last_total_tokens)}
          </span>
          {pct !== null && (
            <span
              title={t('conversation.tokenUsage.contextTitle', { pct, tokens: fmtNum(tu.context_window!) })}
              className={pct >= 90 ? 'text-red-500' : pct >= 70 ? 'text-amber-500' : ''}
            >
              {t('conversation.tokenUsage.ctx')} {pct}%
            </span>
          )}
        </div>
      </div>
    );
  }

  if (entry.entry_type.type === 'result_message') {
    return (
      <div className="px-4 py-2 text-sm">
        <ResultMessageCard
          content={entry.content}
          isError={entry.entry_type.is_error}
          subtype={entry.entry_type.subtype}
          durationMs={Number(entry.entry_type.duration_ms)}
          numTurns={Number(entry.entry_type.num_turns)}
          totalCostUsd={entry.entry_type.total_cost_usd ?? undefined}
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
