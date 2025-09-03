import MarkdownRenderer from '@/components/ui/markdown-renderer.tsx';
import {
  AlertCircle,
  CheckSquare,
  ChevronDown,
  Edit,
  Eye,
  Globe,
  Plus,
  Search,
  Settings,
  Terminal,
} from 'lucide-react';
import {
  NormalizedEntry,
  type NormalizedEntryType,
  type ActionType,
} from 'shared/types.ts';
import type { ProcessStartPayload } from '@/types/logs';
import FileChangeRenderer from './FileChangeRenderer';
import ToolDetails from './ToolDetails';
import { Braces, FileText } from 'lucide-react';
import { useExpandable } from '@/stores/useExpandableStore';

type Props = {
  entry: NormalizedEntry | ProcessStartPayload;
  expansionKey: string;
  diffDeletable?: boolean;
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
  const base = 'text-sm whitespace-pre-wrap break-words';
  if (
    entryType.type === 'tool_use' &&
    entryType.action_type.action === 'command_run'
  )
    return `${base} font-mono`;

  // Keep content-only styling — no bg/padding/rounded here.
  if (entryType.type === 'error_message')
    return `${base} font-mono text-destructive`;

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
    return base; // Card handles the visual treatment

  return base;
};

const getIconFromAction = (
  action?: { action?: string },
  tool_name?: string
) => {
  const a = action?.action;
  const tool = tool_name?.toLowerCase();
  if (!a && !tool) return <Settings className="h-4 w-4 text-gray-400" />;
  if (
    a === 'todo_management' ||
    (tool &&
      ['todowrite', 'todoread', 'todo_write', 'todo_read', 'todo'].includes(
        tool
      ))
  )
    return <CheckSquare className="h-4 w-4 text-purple-600" />;
  if (a === 'file_read') return <Eye className="h-4 w-4 text-orange-600" />;
  if (a === 'file_edit') return <Edit className="h-4 w-4 text-destructive" />;
  if (a === 'command_run')
    return <Terminal className="h-4 w-4 text-yellow-600" />;
  if (a === 'search') return <Search className="h-4 w-4 text-indigo-600" />;
  if (a === 'web_fetch') return <Globe className="h-4 w-4 text-cyan-600" />;
  if (a === 'task_create') return <Plus className="h-4 w-4 text-teal-600" />;
  if (a === 'plan_presentation')
    return <CheckSquare className="h-4 w-4 text-blue-600" />;
  return <Settings className="h-4 w-4 text-gray-600" />;
};

/*********************
 * Unified card      *
 *********************/

type CardVariant = 'system' | 'error';

const MessageCard: React.FC<{
  children: React.ReactNode;
  icon?: React.ReactNode;
  variant: CardVariant;
  expanded?: boolean;
  onToggle?: () => void;
}> = ({ children, icon, variant, expanded, onToggle }) => {
  const frameBase =
    'border rounded-lg shadow-sm px-3 py-2 w-full cursor-pointer';
  const systemTheme =
    'bg-amber-50/70 border-amber-200 text-amber-900 dark:bg-amber-950/20 dark:border-amber-900/40 dark:text-amber-100';
  const errorTheme =
    'bg-red-50 border-red-200 text-red-900 dark:bg-red-950/20 dark:border-red-900/40 dark:text-red-100';

  return (
    <div className="inline-block w-full">
      <div
        className={`${frameBase} ${
          variant === 'system' ? systemTheme : errorTheme
        }`}
        onClick={onToggle}
      >
        <div className="flex items-start gap-2">
          {icon && <div className="mt-0.5 shrink-0">{icon}</div>}
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
      ? 'text-amber-700 dark:text-amber-300'
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

  const icon =
    variant === 'system' ? (
      <Settings className="h-4 w-4 text-amber-700 dark:text-amber-300" />
    ) : (
      <AlertCircle className="h-4 w-4 text-red-700 dark:text-red-300" />
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
    return (
      <MessageCard icon={icon} variant={variant}>
        {Inner}
      </MessageCard>
    );
  }

  return expanded ? (
    <MessageCard
      icon={icon}
      variant={variant}
      expanded={expanded}
      onToggle={toggle}
    >
      {Inner}
    </MessageCard>
  ) : (
    <MessageCard
      icon={icon}
      variant={variant}
      expanded={expanded}
      onToggle={toggle}
    >
      {PreviewInner}
    </MessageCard>
  );
};

const ToolCallCard: React.FC<{
  entryType?: Extract<NormalizedEntryType, { type: 'tool_use' }>;
  action?: any;
  expansionKey: string;
  contentClassName: string;
  content?: string;
  entryContent?: string;
}> = ({
  entryType,
  action,
  expansionKey,
  contentClassName,
  content,
  entryContent,
}) => {
  const at: any = entryType?.action_type || action;
  const [expanded, toggle] = useExpandable(`tool-entry:${expansionKey}`, false);

  const label =
    at?.action === 'command_run'
      ? at?.command || 'Command'
      : entryType?.tool_name || at?.tool_name || 'Tool';

  const hasArgs = at?.action === 'tool' && !!at?.arguments;
  const hasResult = at?.action === 'tool' && !!at?.result;
  const isCommand = at?.action === 'command_run';

  // Command meta
  const output: string | null = isCommand ? (at?.result?.output ?? null) : null;
  const exit = isCommand ? ((at?.result?.exit_status as any) ?? null) : null;

  const hasExpandableDetails =
    hasArgs || hasResult || (isCommand && (Boolean(output) || Boolean(exit)));
  const inlineText = (entryContent || content || '').trim();
  const isSingleLine = inlineText !== '' && !/\r?\n/.test(inlineText);

  const showInlineSummary = isSingleLine;

  // Status badge for command
  let statusBadge: React.ReactNode = null;
  if (isCommand) {
    let ok: boolean | undefined;
    let code: number | undefined;
    if (exit?.type === 'success' && typeof exit.success === 'boolean')
      ok = exit.success;
    if (exit?.type === 'exit_code' && typeof exit.code === 'number') {
      code = exit.code;
      ok = code === 0;
    }
    statusBadge = (
      <span
        className={
          'px-1.5 py-0.5 rounded text-[10px] border ' +
          (ok
            ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-900/40'
            : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-900/40')
        }
        title={
          typeof code === 'number'
            ? `exit code: ${code}`
            : ok
              ? 'success'
              : 'failed'
        }
      >
        {typeof code === 'number' ? `exit ${code}` : ok ? 'ok' : 'fail'}
      </span>
    );
  }

  const HeaderWrapper: React.ElementType = hasExpandableDetails
    ? 'button'
    : 'div';
  const headerProps: any = hasExpandableDetails
    ? {
        onClick: (e: React.MouseEvent) => {
          e.preventDefault();
          toggle();
        },
        title: expanded ? 'Hide details' : 'Show details',
      }
    : {};

  return (
    <div className="inline-block w-full">
      <div className="border rounded-lg shadow-sm w-full overflow-hidden">
        <HeaderWrapper
          {...headerProps}
          className="w-full bg-muted/50 px-3 py-2 flex items-center gap-2 text-left"
        >
          <div className="shrink-0">
            {getIconFromAction(at, entryType?.tool_name || at?.tool_name)}
          </div>

          {/* Label */}
          <span className="text-sm min-w-0 truncate">
            {label}
            {showInlineSummary && <span className="ml-2">{inlineText}</span>}
          </span>

          {/* Meta icons and status */}
          <div className="flex items-center gap-1 ml-auto">
            {hasArgs && <Braces className="h-3.5 w-3.5 text-zinc-500" />}
            {hasResult &&
              (at?.result?.type === 'json' ? (
                <Braces className="h-3.5 w-3.5 text-zinc-500" />
              ) : (
                <FileText className="h-3.5 w-3.5 text-zinc-500" />
              ))}
            {isCommand && statusBadge}
          </div>

          {/* Chevron only if expandable */}
          {hasExpandableDetails && (
            <div className="ml-1">
              <ExpandChevron
                expanded={expanded}
                onClick={toggle}
                variant="system"
              />
            </div>
          )}
        </HeaderWrapper>

        {expanded && (
          <div className="px-3 py-2">
            {(!showInlineSummary || hasExpandableDetails) &&
              (entryContent || content) && (
                <div className={contentClassName + ' mb-2'}>
                  <MarkdownRenderer
                    content={entryContent || content || ''}
                    className="inline"
                  />
                </div>
              )}

            {(() => {
              if (at?.action === 'tool') {
                return (
                  <ToolDetails
                    arguments={at.arguments ?? null}
                    result={
                      at.result
                        ? { type: at.result.type, value: at.result.value }
                        : null
                    }
                  />
                );
              }
              if (at?.action === 'command_run') {
                return (
                  <ToolDetails commandOutput={output} commandExit={exit} />
                );
              }
              return null;
            })()}
          </div>
        )}
      </div>
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
      <div className="px-4 py-1">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <ToolCallCard
              action={toolAction}
              expansionKey={expansionKey}
              contentClassName="text-sm whitespace-pre-wrap break-words"
              content={toolAction?.message ?? toolAction?.summary ?? undefined}
            />
          </div>
        </div>
      </div>
    );
  }

  // Handle NormalizedEntry
  const entryType = entry.entry_type;
  const isSystem = entryType.type === 'system_message';
  const isError = entryType.type === 'error_message';
  const isToolUse = entryType.type === 'tool_use';
  const isFileEdit = isToolUse && entryType.action_type.action === 'file_edit';

  return (
    <div className="px-4 py-1">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {isSystem || isError ? (
            <CollapsibleEntry
              content={isNormalizedEntry(entry) ? entry.content : ''}
              markdown={shouldRenderMarkdown(entryType)}
              expansionKey={expansionKey}
              variant={isSystem ? 'system' : 'error'}
              contentClassName={getContentClassName(entryType)}
            />
          ) : isFileEdit ? (
            // Only FileChangeRenderer for file_edit
            Array.isArray(entryType.action_type.changes) &&
            entryType.action_type.changes.map((change, idx) => (
              <FileChangeRenderer
                key={idx}
                path={entryType.action_type.path}
                change={change}
                expansionKey={`edit:${expansionKey}:${idx}`}
              />
            ))
          ) : isToolUse ? (
            <ToolCallCard
              entryType={entryType}
              expansionKey={expansionKey}
              contentClassName={getContentClassName(entryType)}
              entryContent={isNormalizedEntry(entry) ? entry.content : ''}
            />
          ) : (
            <div className={getContentClassName(entryType)}>
              {shouldRenderMarkdown(entryType) ? (
                <MarkdownRenderer
                  content={isNormalizedEntry(entry) ? entry.content : ''}
                  className="whitespace-pre-wrap break-words"
                />
              ) : isNormalizedEntry(entry) ? (
                entry.content
              ) : (
                ''
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default DisplayConversationEntry;
