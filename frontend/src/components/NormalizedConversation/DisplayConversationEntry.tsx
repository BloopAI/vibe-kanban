import MarkdownRenderer from '@/components/ui/markdown-renderer.tsx';
import {
  ActionType,
  NormalizedEntry,
  type NormalizedEntryType,
} from 'shared/types.ts';
import type { ProcessStartPayload } from '@/types/logs';
import FileChangeRenderer from './FileChangeRenderer';
import { renderJson } from './ToolDetails';
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

type Props = {
  entry: NormalizedEntry | ProcessStartPayload;
  expansionKey: string;
  diffDeletable?: boolean;
};

type FileEditAction = Extract<ActionType, { action: 'file_edit' }>;

const getEntryIcon = (entryType: NormalizedEntryType) => {
  const iconSize = 'h-3 w-3';
  if (entryType.type === 'user_message') {
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

const getStatusIndicator = (entryType: NormalizedEntryType) => {
  const result =
    entryType.type === 'tool_use' &&
    entryType.action_type.action === 'command_run'
      ? entryType.action_type.result?.exit_status
      : null;

  const status =
    result?.type === 'success'
      ? result.success
        ? 'success'
        : 'error'
      : result?.type === 'exit_code'
        ? result.code === 0
          ? 'success'
          : 'error'
        : 'unknown';

  if (status === 'unknown') return null;

  const colorMap: Record<typeof status, string> = {
    success: 'bg-green-300',
    error: 'bg-red-300',
  };

  return (
    <div className="relative">
      <div
        className={`${colorMap[status]} h-1.5 w-1.5 rounded-full absolute -left-1 -bottom-4`}
      />
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

const PlanPresentationCard: React.FC<{
  plan: string;
  expansionKey: string;
}> = ({ plan, expansionKey }) => {
  const [expanded, toggle] = useExpandable(`plan-entry:${expansionKey}`, true);

  return (
    <div className="inline-block w-full">
      <div className="border w-full overflow-hidden  border-blue-400/40">
        <button
          onClick={(e: React.MouseEvent) => {
            e.preventDefault();
            toggle();
          }}
          title={expanded ? 'Hide plan' : 'Show plan'}
          className="w-full px-2 py-1.5 flex items-center gap-1.5 text-left bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300 border-b border-blue-400/40"
        >
          <span className=" min-w-0 truncate">
            <span className="font-semibold">Plan</span>
          </span>
          <div className="ml-auto flex items-center gap-2">
            <ExpandChevron
              expanded={expanded}
              onClick={toggle}
              variant="system"
            />
          </div>
        </button>

        {expanded && (
          <div className="px-3 py-2 max-h-[65vh] overflow-y-auto overscroll-contain bg-blue-50 dark:bg-blue-950/20">
            <div className=" text-blue-700 dark:text-blue-300">
              <MarkdownRenderer
                content={plan}
                className="whitespace-pre-wrap break-words"
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
}> = ({ entryType, action, expansionKey, content, entryContent }) => {
  const at: any = entryType?.action_type || action;
  const [expanded, toggle] = useExpandable(`tool-entry:${expansionKey}`, false);

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
        title: expanded ? 'Hide details' : 'Show details',
      }
    : {};

  return (
    <div className="inline-block w-full  flex flex-col gap-4">
      <HeaderWrapper
        {...headerProps}
        className="w-full flex items-center gap-1.5 text-left text-secondary-foreground"
      >
        <span className=" min-w-0 flex items-center gap-1.5">
          {entryType ? (
            <span>
              {getStatusIndicator(entryType)}
              {getEntryIcon(entryType)}
            </span>
          ) : (
            <span className="font-normal flex">{label}</span>
          )}
          {showInlineSummary && (
            <span className="font-light">{inlineText}</span>
          )}
        </span>
      </HeaderWrapper>

      {expanded && (
        <div className="max-h-[200px] overflow-y-auto border">
          {isCommand ? (
            <>
              {argsText && (
                <>
                  <div className="font-normal uppercase bg-background border-b border-dashed px-2 py-1">
                    Args
                  </div>
                  <div className="px-2 py-1">{argsText}</div>
                </>
              )}

              {output && (
                <>
                  <div className="font-normal uppercase bg-background border-y border-dashed px-2 py-1">
                    Output
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
                    Args
                  </div>
                  <div className="px-2 py-1">
                    {renderJson(entryType.action_type.arguments)}
                  </div>
                  <div className="font-normal uppercase bg-background border-y border-dashed px-2 py-1">
                    Result
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

/*******************
 * Main component  *
 *******************/

function DisplayConversationEntry({ entry, expansionKey }: Props) {
  const isNormalizedEntry = (
    entry: NormalizedEntry | ProcessStartPayload
  ): entry is NormalizedEntry => 'entry_type' in entry;

  const isProcessStart = (
    entry: NormalizedEntry | ProcessStartPayload
  ): entry is ProcessStartPayload => 'processId' in entry;

  if (isProcessStart(entry)) {
    const toolAction: any = entry.action ?? null;
    return (
      <ToolCallCard
        action={toolAction}
        expansionKey={expansionKey}
        content={toolAction?.message ?? toolAction?.summary ?? undefined}
      />
    );
  }

  // Handle NormalizedEntry
  const entryType = entry.entry_type;
  const isSystem = entryType.type === 'system_message';
  const isError = entryType.type === 'error_message';
  const isToolUse = entryType.type === 'tool_use';
  const isFileEdit = (a: ActionType): a is FileEditAction =>
    a.action === 'file_edit';
  return (
    <>
      {isSystem || isError ? (
        <CollapsibleEntry
          content={isNormalizedEntry(entry) ? entry.content : ''}
          markdown={shouldRenderMarkdown(entryType)}
          expansionKey={expansionKey}
          variant={isSystem ? 'system' : 'error'}
          contentClassName={getContentClassName(entryType)}
        />
      ) : isToolUse && isFileEdit(entryType.action_type) ? (
        // Only FileChangeRenderer for file_edit
        (() => {
          const fileEditAction = entryType.action_type as FileEditAction;
          return fileEditAction.changes.map((change, idx) => (
            <FileChangeRenderer
              key={idx}
              path={fileEditAction.path}
              change={change}
              expansionKey={`edit:${expansionKey}:${idx}`}
            />
          ));
        })()
      ) : isToolUse && entryType.action_type.action === 'plan_presentation' ? (
        <PlanPresentationCard
          plan={entryType.action_type.plan}
          expansionKey={expansionKey}
        />
      ) : isToolUse ? (
        <ToolCallCard
          entryType={entryType}
          expansionKey={expansionKey}
          entryContent={isNormalizedEntry(entry) ? entry.content : ''}
        />
      ) : (
        <div className={getContentClassName(entryType)}>
          {shouldRenderMarkdown(entryType) ? (
            <MarkdownRenderer
              content={isNormalizedEntry(entry) ? entry.content : ''}
              className="whitespace-pre-wrap break-words flex flex-col gap-1 font-light"
            />
          ) : isNormalizedEntry(entry) ? (
            entry.content
          ) : (
            ''
          )}
        </div>
      )}
    </>
  );
}

export default DisplayConversationEntry;
