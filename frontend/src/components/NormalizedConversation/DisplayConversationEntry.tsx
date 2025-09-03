import MarkdownRenderer from '@/components/ui/markdown-renderer.tsx';
import {
  AlertCircle,
  Bot,
  Brain,
  CheckSquare,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Edit,
  Eye,
  Globe,
  Plus,
  Search,
  Settings,
  Terminal,
  User,
} from 'lucide-react';
import {
  NormalizedEntry,
  type NormalizedEntryType,
  type ActionType,
} from 'shared/types.ts';
import FileChangeRenderer from './FileChangeRenderer';
import ToolDetails from './ToolDetails';
import { Braces, FileText } from 'lucide-react';
import { useExpandable } from '@/stores/useExpandableStore';

type Props = {
  entry: NormalizedEntry;
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

const getEntryIcon = (entryType: NormalizedEntryType) => {
  if (entryType.type === 'user_message')
    return <User className="h-4 w-4 text-blue-600" />;
  if (entryType.type === 'assistant_message')
    return <Bot className="h-4 w-4 text-success" />;
  if (entryType.type === 'thinking')
    return <Brain className="h-4 w-4 text-purple-600" />;
  if (entryType.type === 'tool_use') {
    const { action_type, tool_name } = entryType;
    if (
      action_type.action === 'todo_management' ||
      (tool_name &&
        ['todowrite', 'todoread', 'todo_write', 'todo_read', 'todo'].includes(
          tool_name.toLowerCase()
        ))
    )
      return <CheckSquare className="h-4 w-4 text-purple-600" />;
    if (action_type.action === 'file_read')
      return <Eye className="h-4 w-4 text-orange-600" />;
    if (action_type.action === 'file_edit')
      return <Edit className="h-4 w-4 text-destructive" />;
    if (action_type.action === 'command_run')
      return <Terminal className="h-4 w-4 text-yellow-600" />;
    if (action_type.action === 'search')
      return <Search className="h-4 w-4 text-indigo-600" />;
    if (action_type.action === 'web_fetch')
      return <Globe className="h-4 w-4 text-cyan-600" />;
    if (action_type.action === 'task_create')
      return <Plus className="h-4 w-4 text-teal-600" />;
    if (action_type.action === 'plan_presentation')
      return <CheckSquare className="h-4 w-4 text-blue-600" />;
    return <Settings className="h-4 w-4 text-gray-600" />;
  }
  return <Settings className="h-4 w-4 text-gray-400" />;
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

/*******************
 * Main component  *
 *******************/

function DisplayConversationEntry({ entry, expansionKey }: Props) {
  const entryType = entry.entry_type;
  const isSystem = entryType.type === 'system_message';
  const isError = entryType.type === 'error_message';
  const isToolUse = entryType.type === 'tool_use';

  const toolAction: any = isToolUse ? (entryType as any).action_type : null;
  const hasArgs = toolAction?.action === 'tool' && !!toolAction?.arguments;
  const hasResult = toolAction?.action === 'tool' && !!toolAction?.result;
  const isCommand = toolAction?.action === 'command_run';
  const commandOutput: string | null = isCommand
    ? (toolAction?.result?.output ?? null)
    : null;
  let commandSuccess: boolean | undefined = undefined;
  let commandExitCode: number | undefined = undefined;
  if (isCommand) {
    const st: any = toolAction?.result?.exit_status;
    if (st && typeof st === 'object') {
      if (st.type === 'success' && typeof st.success === 'boolean') {
        commandSuccess = st.success;
      } else if (st.type === 'exit_code' && typeof st.code === 'number') {
        commandExitCode = st.code;
        commandSuccess = st.code === 0;
      }
    }
  }
  const outputMeta = (() => {
    if (!commandOutput) return null;
    const lineCount =
      commandOutput === '' ? 0 : commandOutput.split('\n').length;
    const bytes = new Blob([commandOutput]).size;
    const kb = bytes / 1024;
    const sizeStr = kb >= 1 ? `${kb.toFixed(1)} kB` : `${bytes} B`;
    return { lineCount, sizeStr };
  })();
  const canExpandTool =
    (isCommand && !!commandOutput) ||
    (toolAction?.action === 'tool' && (hasArgs || hasResult));
  const [toolExpanded, toggleToolExpanded] = useExpandable(
    `tool-entry:${expansionKey}`,
    false
  );

  return (
    <div className="px-4 py-1">
      <div
        className={`flex items-start gap-3 ${isSystem || isError ? 'pl-1' : ''}`}
      >
        {!(isSystem || isError) && (
          <div className="flex-shrink-0 mt-1">{getEntryIcon(entryType)}</div>
        )}

        <div className={`flex-1 min-w-0`}>
          {isSystem || isError ? (
            <CollapsibleEntry
              content={entry.content}
              markdown={shouldRenderMarkdown(entryType)}
              expansionKey={expansionKey}
              variant={isSystem ? 'system' : 'error'}
              contentClassName={getContentClassName(entryType)}
            />
          ) : !isToolUse ? (
            <div className={getContentClassName(entryType)}>
              {shouldRenderMarkdown(entryType) ? (
                <MarkdownRenderer
                  content={entry.content}
                  className="whitespace-pre-wrap break-words"
                />
              ) : (
                entry.content
              )}
            </div>
          ) : (
            <div>
              {canExpandTool ? (
                <button
                  onClick={() => toggleToolExpanded()}
                  className="flex items-center gap-2 w-full text-left"
                  title={toolExpanded ? 'Hide details' : 'Show details'}
                >
                  <span className="flex items-center gap-1 min-w-0">
                    <span className="text-sm break-words">
                      {shouldRenderMarkdown(entryType) ? (
                        <MarkdownRenderer
                          content={entry.content}
                          className="inline"
                        />
                      ) : (
                        entry.content
                      )}
                    </span>
                    {isCommand ? (
                      <>
                        {typeof commandSuccess === 'boolean' && (
                          <span
                            className={
                              'px-1.5 py-0.5 rounded text-[10px] border whitespace-nowrap ' +
                              (commandSuccess
                                ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-900/40'
                                : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-900/40')
                            }
                            title={
                              typeof commandExitCode === 'number'
                                ? `exit code: ${commandExitCode}`
                                : commandSuccess
                                  ? 'success'
                                  : 'failed'
                            }
                          >
                            {typeof commandExitCode === 'number'
                              ? `exit ${commandExitCode}`
                              : commandSuccess
                                ? 'ok'
                                : 'fail'}
                          </span>
                        )}
                        {commandOutput && (
                          <span
                            title={
                              outputMeta
                                ? `output: ${outputMeta.lineCount} lines · ${outputMeta.sizeStr}`
                                : 'output'
                            }
                          />
                        )}
                      </>
                    ) : (
                      <>
                        {hasArgs && (
                          <Braces className="h-3.5 w-3.5 text-zinc-500" />
                        )}
                        {hasResult &&
                          (toolAction?.result?.type === 'json' ? (
                            <Braces className="h-3.5 w-3.5 text-zinc-500" />
                          ) : (
                            <FileText className="h-3.5 w-3.5 text-zinc-500" />
                          ))}
                      </>
                    )}
                  </span>
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <div className={'text-sm break-words'}>
                    {shouldRenderMarkdown(entryType) ? (
                      <MarkdownRenderer
                        content={entry.content}
                        className="inline"
                      />
                    ) : (
                      entry.content
                    )}
                  </div>
                  {isCommand ? (
                    <>
                      {commandOutput && (
                        <span
                          title={
                            outputMeta
                              ? `output: ${outputMeta.lineCount} lines · ${outputMeta.sizeStr}`
                              : 'output'
                          }
                        >
                          <FileText className="h-3.5 w-3.5 text-zinc-500" />
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      {hasArgs && (
                        <Braces className="h-3.5 w-3.5 text-zinc-500" />
                      )}
                      {hasResult &&
                        (toolAction?.result?.type === 'json' ? (
                          <Braces className="h-3.5 w-3.5 text-zinc-500" />
                        ) : (
                          <FileText className="h-3.5 w-3.5 text-zinc-500" />
                        ))}
                    </>
                  )}
                </div>
              )}

              {entryType.type === 'tool_use' &&
                toolExpanded &&
                (() => {
                  const at: any = (entryType as any).action_type;
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
                    const output = at?.result?.output as string | undefined;
                    const exit = (at?.result?.exit_status as any) ?? null;
                    return (
                      <ToolDetails
                        commandOutput={output ?? null}
                        commandExit={exit}
                      />
                    );
                  }
                  return null;
                })()}
            </div>
          )}

          {entryType.type === 'tool_use' &&
            entryType.action_type.action === 'file_edit' &&
            Array.isArray((entryType.action_type as any).changes) &&
            (
              entryType.action_type as Extract<
                ActionType,
                { action: 'file_edit' }
              >
            ).changes.map((change, idx) => (
              <FileChangeRenderer
                key={idx}
                path={
                  (
                    entryType.action_type as Extract<
                      ActionType,
                      { action: 'file_edit' }
                    >
                  ).path
                }
                change={change}
                expansionKey={`edit:${expansionKey}:${idx}`}
              />
            ))}
        </div>
      </div>
    </div>
  );
}

export default DisplayConversationEntry;
