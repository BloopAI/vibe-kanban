import { useTranslation } from 'react-i18next';
import WYSIWYGEditor from '@/components/ui/wysiwyg';
import {
  ActionType,
  NormalizedEntry,
  type NormalizedEntryType,
} from 'shared/types.ts';
import FileChangeRenderer from '@/components/NormalizedConversation/FileChangeRenderer';
import { useExpandable } from '@/stores/useExpandableStore';
import {
  WarningCircle,
  Robot,
  CheckCircle,
  CheckSquare,
  CaretDown,
  PencilSimple,
  Eye,
  Globe,
  Hammer,
  Plus,
  MagnifyingGlass,
  Gear,
  Terminal,
  User,
} from '@phosphor-icons/react';
import RawLogText from '@/components/common/RawLogText';
import { cn } from '@/lib/utils';

type Props = {
  entry: NormalizedEntry;
  expansionKey: string;
};

type FileEditAction = Extract<ActionType, { action: 'file_edit' }>;

const getEntryIcon = (entryType: NormalizedEntryType) => {
  const iconClassName = 'size-icon-xs';
  if (entryType.type === 'user_message' || entryType.type === 'user_feedback') {
    return <User className={iconClassName} />;
  }
  if (entryType.type === 'assistant_message') {
    return <Robot className={iconClassName} />;
  }
  if (entryType.type === 'system_message') {
    return <Gear className={iconClassName} />;
  }
  if (entryType.type === 'error_message') {
    return <WarningCircle className={iconClassName} />;
  }
  if (entryType.type === 'tool_use') {
    const { action_type, tool_name } = entryType;

    if (
      action_type.action === 'todo_management' ||
      (tool_name &&
        ['todowrite', 'todoread', 'todo_write', 'todo_read', 'todo'].includes(
          tool_name.toLowerCase()
        ))
    ) {
      return <CheckSquare className={iconClassName} />;
    }

    if (action_type.action === 'file_read') {
      return <Eye className={iconClassName} />;
    } else if (action_type.action === 'file_edit') {
      return <PencilSimple className={iconClassName} />;
    } else if (action_type.action === 'command_run') {
      return <Terminal className={iconClassName} />;
    } else if (action_type.action === 'search') {
      return <MagnifyingGlass className={iconClassName} />;
    } else if (action_type.action === 'web_fetch') {
      return <Globe className={iconClassName} />;
    } else if (action_type.action === 'task_create') {
      return <Plus className={iconClassName} />;
    } else if (action_type.action === 'plan_presentation') {
      return <CheckSquare className={iconClassName} />;
    } else if (action_type.action === 'tool') {
      return <Hammer className={iconClassName} />;
    }
    return <Gear className={iconClassName} />;
  }
  return <Gear className={iconClassName} />;
};

const shouldRenderMarkdown = (entryType: NormalizedEntryType) =>
  entryType.type === 'assistant_message' ||
  entryType.type === 'system_message' ||
  entryType.type === 'tool_use';

const getContentClassName = (entryType: NormalizedEntryType) => {
  const base = ' whitespace-pre-wrap break-words';
  if (
    entryType.type === 'tool_use' &&
    entryType.action_type.action === 'command_run'
  )
    return `${base} font-mono`;

  if (entryType.type === 'error_message')
    return `${base} font-mono text-destructive`;

  return base;
};

type CardVariant = 'system' | 'error';

const MessageCard: React.FC<{
  children: React.ReactNode;
  variant: CardVariant;
  expanded?: boolean;
  onToggle?: () => void;
}> = ({ children, variant, expanded, onToggle }) => {
  const frameBase =
    'border px-3 py-2 w-full cursor-pointer bg-[hsl(var(--card))] border-[hsl(var(--border))]';
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
    <CaretDown
      onClick={onClick}
      className={`size-icon-base cursor-pointer transition-transform ${color} ${
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
        <WYSIWYGEditor
          value={content}
          disabled
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
        <WYSIWYGEditor
          value={firstLine}
          disabled
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

const ToolCallCard: React.FC<{
  entry: NormalizedEntry;
  expansionKey: string;
}> = ({ entry, expansionKey }) => {
  const { t } = useTranslation('common');

  const entryType =
    entry.entry_type.type === 'tool_use' ? entry.entry_type : undefined;

  const linkifyUrls = entryType?.tool_name === 'Tool Install Script';
  const defaultExpanded = linkifyUrls;

  const [expanded, toggle] = useExpandable(
    `tool-entry:${expansionKey}`,
    defaultExpanded
  );

  const actionType = entryType?.action_type;
  const isCommand = actionType?.action === 'command_run';
  const isTool = actionType?.action === 'tool';

  const label = isCommand ? 'Ran' : entryType?.tool_name || 'Tool';

  const inlineText = entry.content.trim();
  const isSingleLine = inlineText !== '' && !/\r?\n/.test(inlineText);
  const showInlineSummary = isSingleLine;

  const commandResult = isCommand ? actionType.result : null;
  const output = commandResult?.output ?? null;
  let argsText: string | null = null;
  if (isCommand) {
    const fromArgs =
      typeof actionType.command === 'string' ? actionType.command : '';
    const fallback = inlineText;
    argsText = (fromArgs || fallback).trim();
  }

  const hasArgs = isTool && !!actionType.arguments;
  const hasResult = isTool && !!actionType.result;

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
        title: expanded
          ? t('conversation.toolDetailsToggle.hide')
          : t('conversation.toolDetailsToggle.show'),
      }
    : {};

  const headerClassName = cn(
    'w-full flex items-center gap-1.5 text-left text-secondary-foreground'
  );

  const renderJson = (v: unknown) => (
    <pre className="whitespace-pre-wrap">{JSON.stringify(v, null, 2)}</pre>
  );

  return (
    <div className="inline-block w-full flex flex-col gap-4">
      <HeaderWrapper {...headerProps} className={headerClassName}>
        <span className="min-w-0 flex items-center gap-1.5">
          <span>{entryType && getEntryIcon(entryType)}</span>
          {showInlineSummary ? (
            <span className="font-mono">{inlineText}</span>
          ) : (
            <span className="font-mono">{label}</span>
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
                        <WYSIWYGEditor
                          value={actionType.result.value?.toString()}
                          disabled
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

function MockDisplayConversationEntry({ entry, expansionKey }: Props) {
  const entryType = entry.entry_type;
  const isSystem = entryType.type === 'system_message';
  const isError = entryType.type === 'error_message';
  const isToolUse = entryType.type === 'tool_use';
  const isUserMessage = entryType.type === 'user_message';
  const isFileEdit = (a: ActionType): a is FileEditAction =>
    a.action === 'file_edit';

  // User message - simple rendering
  if (isUserMessage) {
    return (
      <div className="px-4 py-2 text-base">
        <div className="flex items-start gap-2">
          <User className="size-icon-base mt-0.5 text-muted-foreground" />
          <div className="flex-1">
            <WYSIWYGEditor
              value={entry.content}
              disabled
              className="whitespace-pre-wrap break-words"
            />
          </div>
        </div>
      </div>
    );
  }

  // Tool use rendering
  if (isToolUse) {
    const toolEntry = entryType;

    // File edit - use FileChangeRenderer
    if (isFileEdit(toolEntry.action_type)) {
      const fileEditAction = toolEntry.action_type as FileEditAction;
      return (
        <div className="px-4 py-2 text-base space-y-3">
          {fileEditAction.changes.map((change, idx) => (
            <FileChangeRenderer
              key={idx}
              path={fileEditAction.path}
              change={change}
              expansionKey={`edit:${expansionKey}:${idx}`}
              defaultExpanded={false}
            />
          ))}
        </div>
      );
    }

    // Other tool uses
    return (
      <div className="px-4 py-2 text-base space-y-3">
        <ToolCallCard entry={entry} expansionKey={expansionKey} />
      </div>
    );
  }

  // System or error messages - collapsible
  if (isSystem || isError) {
    return (
      <div className="px-4 py-2 text-base">
        <CollapsibleEntry
          content={entry.content}
          markdown={shouldRenderMarkdown(entryType)}
          expansionKey={expansionKey}
          variant={isSystem ? 'system' : 'error'}
          contentClassName={getContentClassName(entryType)}
        />
      </div>
    );
  }

  // Next action - simple completion indicator
  if (entry.entry_type.type === 'next_action') {
    return (
      <div className="px-4 py-2 text-base">
        <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
          <CheckCircle className="size-icon-base" />
          <span>Task completed</span>
        </div>
      </div>
    );
  }

  // Default: assistant message or other types
  return (
    <div className="px-4 py-2 text-base">
      <div className="flex items-start gap-2">
        <Robot className="size-icon-base mt-0.5 text-muted-foreground" />
        <div className={cn('flex-1', getContentClassName(entryType))}>
          {shouldRenderMarkdown(entryType) ? (
            <WYSIWYGEditor
              value={entry.content}
              disabled
              className="whitespace-pre-wrap break-words flex flex-col gap-1 font-light"
            />
          ) : (
            entry.content
          )}
        </div>
      </div>
    </div>
  );
}

export default MockDisplayConversationEntry;
