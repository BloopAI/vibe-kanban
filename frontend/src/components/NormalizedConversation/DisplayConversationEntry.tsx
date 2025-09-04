import MarkdownRenderer from '@/components/ui/markdown-renderer.tsx';
import { AlertCircle, Check, ChevronDown, Settings } from 'lucide-react';
import {
  ActionType,
  NormalizedEntry,
  type NormalizedEntryType,
} from 'shared/types.ts';
import type { ProcessStartPayload } from '@/types/logs';
import FileChangeRenderer from './FileChangeRenderer';
import ToolDetails from './ToolDetails';
import { useExpandable } from '@/stores/useExpandableStore';

type Props = {
  entry: NormalizedEntry | ProcessStartPayload;
  expansionKey: string;
  diffDeletable?: boolean;
};

type FileEditAction = Extract<ActionType, { action: 'file_edit' }>;

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
    'border rounded-lg shadow-sm px-3 py-2 w-full cursor-pointer text-xs bg-[hsl(var(--card))] border-[hsl(var(--border))]';
  const systemTheme = 'border-amber-400/40 text-[hsl(var(--foreground))]';
  const errorTheme = 'border-red-400/40 text-[hsl(var(--foreground))]';

  return (
    <div className="inline-block w-full">
      <div
        className={`${frameBase} ${
          variant === 'system' ? systemTheme : errorTheme
        }`}
        onClick={onToggle}
      >
        <div className="flex items-center gap-1.5">
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
      <Settings className="h-4 w-4 text-amber-300" />
    ) : (
      <AlertCircle className="h-4 w-4 text-red-300" />
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
      ? 'Run'
      : entryType?.tool_name || at?.tool_name || 'Tool';

  const isCommand = at?.action === 'command_run';

  // success/failure
  let ok: boolean | undefined;
  if (isCommand) {
    const exit = at?.result?.exit_status ?? null;
    if (exit?.type === 'success' && typeof exit.success === 'boolean') {
      ok = exit.success;
    } else if (exit?.type === 'exit_code' && typeof exit.code === 'number') {
      ok = exit.code === 0;
    }
  }

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
    <div className="inline-block w-full pl-4">
      <div className="border rounded-lg w-full overflow-hidden text-xs">
        <HeaderWrapper
          {...headerProps}
          className="w-full px-2 py-1.5 flex items-center gap-1.5 text-left bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] border-b border-[hsl(var(--border))]"
        >
          <span className="text-xs min-w-0 truncate">
            <span className="font-semibold">{label}</span>
            {showInlineSummary && (
              <span className="ml-2 font-normal">{inlineText}</span>
            )}
          </span>

          {hasExpandableDetails && (
            <div className="ml-auto flex items-center gap-2">
              {isCommand &&
                typeof ok === 'boolean' &&
                (ok ? (
                  <Check
                    className="h-4 w-4 text-green-600"
                    aria-label="Command succeeded"
                  />
                ) : (
                  <AlertCircle
                    className="h-4 w-4 text-red-600"
                    aria-label="Command failed"
                  />
                ))}
              <ExpandChevron
                expanded={expanded}
                onClick={toggle}
                variant="system"
              />
            </div>
          )}
        </HeaderWrapper>

        {expanded && (
          <div className="px-2 py-1.5">
            {!isCommand &&
              (!showInlineSummary || hasExpandableDetails) &&
              (entryContent || content) && (
                <div className={contentClassName + ' mb-2'}>
                  <MarkdownRenderer
                    content={entryContent || content || ''}
                    className="inline"
                  />
                </div>
              )}

            {isCommand ? (
              <>
                {argsText != null && argsText !== '' && (
                  <div className="mb-3">
                    <div className="text-xs font-medium uppercase text-zinc-500 mb-1">
                      Args
                    </div>
                    <ToolDetails commandOutput={argsText} />
                  </div>
                )}

                <div>
                  <div className="text-xs font-medium uppercase text-zinc-500 mb-1">
                    Output
                  </div>
                  <ToolDetails commandOutput={output ?? ''} />
                </div>
              </>
            ) : (
              <>
                {(entryContent || content) && (
                  <div className={contentClassName + ' mb-2'}>
                    <MarkdownRenderer
                      content={entryContent || content || ''}
                      className="inline"
                    />
                  </div>
                )}
                {at?.action === 'tool' && (
                  <ToolDetails
                    arguments={at.arguments ?? null}
                    result={
                      at.result
                        ? { type: at.result.type, value: at.result.value }
                        : null
                    }
                  />
                )}
              </>
            )}
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
  const isFileEdit = (a: ActionType): a is FileEditAction =>
    a.action === 'file_edit';
  return (
    <div className="px-4 py-0.5">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {isSystem || isError ? (
            <div className="p-2">
              <CollapsibleEntry
                content={isNormalizedEntry(entry) ? entry.content : ''}
                markdown={shouldRenderMarkdown(entryType)}
                expansionKey={expansionKey}
                variant={isSystem ? 'system' : 'error'}
                contentClassName={getContentClassName(entryType)}
              />
            </div>
          ) : isToolUse && isFileEdit(entryType.action_type) ? (
            // Only FileChangeRenderer for file_edit
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
