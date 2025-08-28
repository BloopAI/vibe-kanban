import MarkdownRenderer from '@/components/ui/markdown-renderer.tsx';
import {
  AlertCircle,
  Bot,
  Brain,
  CheckSquare,
  ChevronRight,
  ChevronUp,
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
import { Braces, FileText, MoreHorizontal } from 'lucide-react';

type Props = {
  entry: NormalizedEntry;
  expansionKey: string;
  diffDeletable?: boolean;
};

const getEntryIcon = (entryType: NormalizedEntryType) => {
  if (entryType.type === 'user_message') {
    return <User className="h-4 w-4 text-blue-600" />;
  }
  if (entryType.type === 'assistant_message') {
    return <Bot className="h-4 w-4 text-success" />;
  }
  if (entryType.type === 'system_message') {
    return <Settings className="h-4 w-4 text-gray-600" />;
  }
  if (entryType.type === 'thinking') {
    return <Brain className="h-4 w-4 text-purple-600" />;
  }
  if (entryType.type === 'error_message') {
    return <AlertCircle className="h-4 w-4 text-destructive" />;
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
      return <CheckSquare className="h-4 w-4 text-purple-600" />;
    }

    if (action_type.action === 'file_read') {
      return <Eye className="h-4 w-4 text-orange-600" />;
    } else if (action_type.action === 'file_edit') {
      return <Edit className="h-4 w-4 text-destructive" />;
    } else if (action_type.action === 'command_run') {
      return <Terminal className="h-4 w-4 text-yellow-600" />;
    } else if (action_type.action === 'search') {
      return <Search className="h-4 w-4 text-indigo-600" />;
    } else if (action_type.action === 'web_fetch') {
      return <Globe className="h-4 w-4 text-cyan-600" />;
    } else if (action_type.action === 'task_create') {
      return <Plus className="h-4 w-4 text-teal-600" />;
    } else if (action_type.action === 'plan_presentation') {
      return <CheckSquare className="h-4 w-4 text-blue-600" />;
    }
    return <Settings className="h-4 w-4 text-gray-600" />;
  }
  return <Settings className="h-4 w-4 text-gray-400" />;
};

const getContentClassName = (entryType: NormalizedEntryType) => {
  const baseClasses = 'text-sm whitespace-pre-wrap break-words';

  if (
    entryType.type === 'tool_use' &&
    entryType.action_type.action === 'command_run'
  ) {
    return `${baseClasses} font-mono`;
  }

  if (entryType.type === 'error_message') {
    return `${baseClasses} text-destructive font-mono bg-red-50 dark:bg-red-950/20 px-2 py-1 rounded`;
  }

  // Special styling for TODO lists
  if (
    entryType.type === 'tool_use' &&
    (entryType.action_type.action === 'todo_management' ||
      (entryType.tool_name &&
        (entryType.tool_name.toLowerCase() === 'todowrite' ||
          entryType.tool_name.toLowerCase() === 'todoread' ||
          entryType.tool_name.toLowerCase() === 'todo_write' ||
          entryType.tool_name.toLowerCase() === 'todo_read' ||
          entryType.tool_name.toLowerCase() === 'todo')))
  ) {
    return `${baseClasses} font-mono text-zinc-800 dark:text-zinc-200 bg-zinc-50 dark:bg-zinc-900/40 px-2 py-1 rounded`;
  }

  // Special styling for plan presentations
  if (
    entryType.type === 'tool_use' &&
    entryType.action_type.action === 'plan_presentation'
  ) {
    return `${baseClasses} text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/20 px-3 py-2 rounded-md border-l-4 border-blue-400`;
  }

  return baseClasses;
};

// Helper function to determine if content should be rendered as markdown
const shouldRenderMarkdown = (entryType: NormalizedEntryType) => {
  // Render markdown for assistant messages, plan presentations, and tool outputs that contain backticks
  return (
    entryType.type === 'assistant_message' ||
    entryType.type === 'system_message' ||
    entryType.type === 'thinking' ||
    entryType.type === 'tool_use'
  );
};

import { useExpandable } from '@/stores/useExpandableStore';

function DisplayConversationEntry({ entry, expansionKey }: Props) {
  const isErrorMessage = entry.entry_type.type === 'error_message';
  const hasMultipleLines = isErrorMessage && entry.content.includes('\n');
  const [isExpanded, setIsExpanded] = useExpandable(
    `err:${expansionKey}`,
    false
  );

  const fileEdit =
    entry.entry_type.type === 'tool_use' &&
    entry.entry_type.action_type.action === 'file_edit'
      ? (entry.entry_type.action_type as Extract<
          ActionType,
          { action: 'file_edit' }
        >)
      : null;

  // One-line collapsed UX for tool entries
  const isToolUse = entry.entry_type.type === 'tool_use';
  const toolAction: any = isToolUse
    ? (entry.entry_type as any).action_type
    : null;
  const hasArgs = toolAction?.action === 'tool' && !!toolAction?.arguments;
  const hasResult = toolAction?.action === 'tool' && !!toolAction?.result;
  const isCommand = toolAction?.action === 'command_run';
  const commandOutput: string | null = isCommand
    ? (toolAction?.result?.output ?? null)
    : null;
  // Derive success from either { type: 'success', success: boolean } or { type: 'exit_code', code: number }
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
  const canExpand =
    (isCommand && !!commandOutput) ||
    (toolAction?.action === 'tool' && (hasArgs || hasResult));

  const [toolExpanded, toggleToolExpanded] = useExpandable(
    `tool-entry:${expansionKey}`,
    false
  );

  return (
    <div className="px-4 py-1">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-1">
          {isErrorMessage && hasMultipleLines ? (
            <button
              onClick={() => setIsExpanded()}
              className="transition-colors hover:opacity-70"
            >
              {getEntryIcon(entry.entry_type)}
            </button>
          ) : (
            getEntryIcon(entry.entry_type)
          )}
        </div>
        <div className="flex-1 min-w-0">
          {isErrorMessage && hasMultipleLines ? (
            <div className={isExpanded ? 'space-y-2' : ''}>
              <div className={getContentClassName(entry.entry_type)}>
                {isExpanded ? (
                  shouldRenderMarkdown(entry.entry_type) ? (
                    <MarkdownRenderer
                      content={entry.content}
                      className="whitespace-pre-wrap break-words"
                    />
                  ) : (
                    entry.content
                  )
                ) : (
                  <>
                    {entry.content.split('\n')[0]}
                    <button
                      onClick={() => setIsExpanded()}
                      className="ml-2 inline-flex items-center gap-1 text-xs text-destructive hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors"
                    >
                      <ChevronRight className="h-3 w-3" />
                      Show more
                    </button>
                  </>
                )}
              </div>
              {isExpanded && (
                <button
                  onClick={() => setIsExpanded()}
                  className="flex items-center gap-1 text-xs text-destructive hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors"
                >
                  <ChevronUp className="h-3 w-3" />
                  Show less
                </button>
              )}
            </div>
          ) : (
            <div>
              {isToolUse ? (
                canExpand ? (
                  <button
                    onClick={() => toggleToolExpanded()}
                    className="flex items-center gap-2 w-full text-left"
                    title={toolExpanded ? 'Hide details' : 'Show details'}
                  >
                    <span className="flex items-center gap-1 min-w-0">
                      <span
                        className="text-sm truncate whitespace-nowrap overflow-hidden text-ellipsis"
                        title={entry.content}
                      >
                        {shouldRenderMarkdown(entry.entry_type) ? (
                          <MarkdownRenderer
                            content={entry.content}
                            className="inline"
                          />
                        ) : (
                          entry.content
                        )}
                      </span>
                      {/* Icons immediately after tool name */}
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
                    </span>
                    <MoreHorizontal className="ml-auto h-4 w-4 text-zinc-400 group-hover:text-zinc-600" />
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <div
                      className={
                        'text-sm truncate whitespace-nowrap overflow-hidden text-ellipsis'
                      }
                      title={entry.content}
                    >
                      {shouldRenderMarkdown(entry.entry_type) ? (
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
                        {typeof commandSuccess === 'boolean' && (
                          <span
                            className={
                              'px-1.5 py-0.5 rounded text-[10px] border whitespace-nowrap ' +
                              (commandSuccess
                                ? 'text-success'
                                : 'text-destructive')
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
                )
              ) : (
                <div className={getContentClassName(entry.entry_type)}>
                  {shouldRenderMarkdown(entry.entry_type) ? (
                    <MarkdownRenderer
                      content={entry.content}
                      className="whitespace-pre-wrap break-words"
                    />
                  ) : (
                    entry.content
                  )}
                </div>
              )}
            </div>
          )}

          {fileEdit &&
            Array.isArray(fileEdit.changes) &&
            fileEdit.changes.map((change, idx) => {
              return (
                <FileChangeRenderer
                  key={idx}
                  path={fileEdit.path}
                  change={change}
                  expansionKey={`edit:${expansionKey}:${idx}`}
                />
              );
            })}
          {entry.entry_type.type === 'tool_use' &&
            toolExpanded &&
            (() => {
              const at: any = entry.entry_type.action_type as any;
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
      </div>
    </div>
  );
}

export default DisplayConversationEntry;
