import { useContext, useMemo, useState } from 'react';
import { DiffCard } from './DiffCard';
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
  type WorktreeDiff,
} from 'shared/types.ts';
import { TaskDiffContext } from '@/components/context/taskDetailsContext.ts';

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

// Parse file path from content (handles various formats)
const parseFilePathFromContent = (content: string): string | null => {
  // Try to extract path from backticks: `path/to/file.ext`
  const backtickMatch = content.match(/`([^`]+)`/);
  if (backtickMatch) {
    return backtickMatch[1];
  }

  // Try to extract from common patterns like "Edit file: path" or "Write file: path"
  const actionMatch = content.match(
    /(?:Edit|Write|Create)\s+file:\s*([^\s\n]+)/i
  );
  if (actionMatch) {
    return actionMatch[1];
  }

  return null;
};

// Helper function to determine if a tool call modifies files
const isFileModificationToolCall = (
  entryType: NormalizedEntryType
): boolean => {
  if (entryType.type !== 'tool_use') {
    return false;
  }

  // Check for direct file write action
  if (entryType.action_type.action === 'file_write') {
    return true;
  }

  // Check for "other" actions that are file modification tools
  if (entryType.action_type.action === 'other') {
    const fileModificationTools = [
      'edit',
      'write',
      'create_file',
      'multiedit',
      'edit_file',
    ];
    return fileModificationTools.includes(
      entryType.tool_name?.toLowerCase() || ''
    );
  }

  return false;
};

// Extract file path from tool call
const extractFilePathFromToolCall = (entry: NormalizedEntry): string | null => {
  if (entry.entry_type.type !== 'tool_use') {
    return null;
  }

  const { action_type, tool_name } = entry.entry_type;

  // Direct path extraction from action_type
  if (action_type.action === 'file_write') {
    return action_type.path || null;
  }

  // For "other" actions, check if it's a known file modification tool
  if (action_type.action === 'other') {
    const fileModificationTools = [
      'edit',
      'write',
      'create_file',
      'multiedit',
      'edit_file',
    ];

    if (fileModificationTools.includes(tool_name.toLowerCase())) {
      // Parse file path from content field
      return parseFilePathFromContent(entry.content);
    }
  }

  return null;
};

// Create filtered diff showing only specific files
const createIncrementalDiff = (
  fullDiff: WorktreeDiff | null,
  targetFilePaths: string[]
): WorktreeDiff | null => {
  if (!fullDiff || targetFilePaths.length === 0) {
    return null;
  }

  // Filter files to only include the target file paths
  const filteredFiles = fullDiff.files.filter((file) =>
    targetFilePaths.some(
      (targetPath) =>
        file.path === targetPath ||
        file.path.endsWith('/' + targetPath) ||
        targetPath.endsWith('/' + file.path)
    )
  );

  if (filteredFiles.length === 0) {
    return null;
  }

  return {
    ...fullDiff,
    files: filteredFiles,
  };
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
        entryType.tool_name.toLowerCase() === 'task'))
  );
};

function DisplayConversationEntry({ entry, index, diffDeletable }: Props) {
  const { diff } = useContext(TaskDiffContext);
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
  const isFileModification = useMemo(
    () => isFileModificationToolCall(entry.entry_type),
    [entry.entry_type]
  );

  // Extract file path from this specific tool call
  const modifiedFilePath = useMemo(
    () => (isFileModification ? extractFilePathFromToolCall(entry) : null),
    [isFileModification, entry]
  );

  // Create incremental diff showing only the files modified by this specific tool call
  const incrementalDiff = useMemo(
    () =>
      modifiedFilePath && diff
        ? createIncrementalDiff(diff, [modifiedFilePath])
        : null,
    [modifiedFilePath, diff]
  );

  // Show incremental diff for this specific file modification
  const shouldShowDiff =
    isFileModification && incrementalDiff && incrementalDiff.files.length > 0;

  return (
    <div key={index}>
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

      {/* Render incremental diff card inline after file modification entries */}
      {shouldShowDiff && incrementalDiff && (
        <div className="mt-4 mb-2">
          <DiffCard
            diff={incrementalDiff}
            deletable={diffDeletable}
            compact={true}
          />
        </div>
      )}
    </div>
  );
}

export default DisplayConversationEntry;
