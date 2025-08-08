import { useState } from 'react';
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
import { NormalizedEntry, type NormalizedEntryType } from 'shared/types.ts';

type Props = {
  entry: NormalizedEntry;
  index: number;
  diffDeletable?: boolean;
};

const getEntryIcon = (entryType: NormalizedEntryType) => {
  if (entryType.type === 'user_message') {
    return <User className="h-4 w-4 text-blue-600" />;
  }
  if (entryType.type === 'assistant_message') {
    return <Bot className="h-4 w-4 text-green-600" />;
  }
  if (entryType.type === 'system_message') {
    return <Settings className="h-4 w-4 text-gray-600" />;
  }
  if (entryType.type === 'thinking') {
    return <Brain className="h-4 w-4 text-purple-600" />;
  }
  if (entryType.type === 'error_message') {
    return <AlertCircle className="h-4 w-4 text-red-600" />;
  }
  if (entryType.type === 'tool_use') {
    const { action_type, tool_name } = entryType;

    // Special handling for TODO tools
    if (
      tool_name &&
      (tool_name.toLowerCase() === 'todowrite' ||
        tool_name.toLowerCase() === 'todoread' ||
        tool_name.toLowerCase() === 'todo_write' ||
        tool_name.toLowerCase() === 'todo_read')
    ) {
      return <CheckSquare className="h-4 w-4 text-purple-600" />;
    }

    if (action_type.action === 'file_read') {
      return <Eye className="h-4 w-4 text-orange-600" />;
    }
    if (action_type.action === 'file_write') {
      return <Edit className="h-4 w-4 text-red-600" />;
    }
    if (action_type.action === 'command_run') {
      return <Terminal className="h-4 w-4 text-yellow-600" />;
    }
    if (action_type.action === 'search') {
      return <Search className="h-4 w-4 text-indigo-600" />;
    }
    if (action_type.action === 'web_fetch') {
      return <Globe className="h-4 w-4 text-cyan-600" />;
    }
    if (action_type.action === 'task_create') {
      return <Plus className="h-4 w-4 text-teal-600" />;
    }
    if (action_type.action === 'plan_presentation') {
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
    return `${baseClasses} text-red-600 font-mono bg-red-50 dark:bg-red-950/20 px-2 py-1 rounded`;
  }

  // Special styling for TODO lists
  if (
    entryType.type === 'tool_use' &&
    entryType.tool_name &&
    (entryType.tool_name.toLowerCase() === 'todowrite' ||
      entryType.tool_name.toLowerCase() === 'todoread' ||
      entryType.tool_name.toLowerCase() === 'todo_write' ||
      entryType.tool_name.toLowerCase() === 'todo_read')
  ) {
    return `${baseClasses} font-mono text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/20 px-2 py-1 rounded`;
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
    (entryType.type === 'tool_use' &&
      entryType.action_type.action === 'plan_presentation') ||
    (entryType.type === 'tool_use' &&
      entryType.tool_name &&
      (entryType.tool_name.toLowerCase() === 'todowrite' ||
        entryType.tool_name.toLowerCase() === 'todoread' ||
        entryType.tool_name.toLowerCase() === 'todo_write' ||
        entryType.tool_name.toLowerCase() === 'todo_read' ||
        entryType.tool_name.toLowerCase() === 'glob' ||
        entryType.tool_name.toLowerCase() === 'ls' ||
        entryType.tool_name.toLowerCase() === 'list_directory' ||
        entryType.tool_name.toLowerCase() === 'read' ||
        entryType.tool_name.toLowerCase() === 'read_file' ||
        entryType.tool_name.toLowerCase() === 'write' ||
        entryType.tool_name.toLowerCase() === 'create_file' ||
        entryType.tool_name.toLowerCase() === 'edit' ||
        entryType.tool_name.toLowerCase() === 'edit_file' ||
        entryType.tool_name.toLowerCase() === 'multiedit' ||
        entryType.tool_name.toLowerCase() === 'bash' ||
        entryType.tool_name.toLowerCase() === 'run_command' ||
        entryType.tool_name.toLowerCase() === 'grep' ||
        entryType.tool_name.toLowerCase() === 'search' ||
        entryType.tool_name.toLowerCase() === 'webfetch' ||
        entryType.tool_name.toLowerCase() === 'web_fetch' ||
        entryType.tool_name.toLowerCase() === 'task' ||
        entryType.tool_name.toLowerCase().startsWith('mcp_')))
  );
};

function DisplayConversationEntry({ entry, index }: Props) {
  const [expandedErrors, setExpandedErrors] = useState<Set<number>>(new Set());

  const toggleErrorExpansion = (index: number) => {
    setExpandedErrors((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const isErrorMessage = entry.entry_type.type === 'error_message';
  const isExpanded = expandedErrors.has(index);
  const hasMultipleLines = isErrorMessage && entry.content.includes('\n');

  return (
    <div key={index} className="px-4 py-1">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-1">
          {isErrorMessage && hasMultipleLines ? (
            <button
              onClick={() => toggleErrorExpansion(index)}
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
                      onClick={() => toggleErrorExpansion(index)}
                      className="ml-2 inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors"
                    >
                      <ChevronRight className="h-3 w-3" />
                      Show more
                    </button>
                  </>
                )}
              </div>
              {isExpanded && (
                <button
                  onClick={() => toggleErrorExpansion(index)}
                  className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors"
                >
                  <ChevronUp className="h-3 w-3" />
                  Show less
                </button>
              )}
            </div>
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
      </div>
    </div>
  );
}

export default DisplayConversationEntry;
