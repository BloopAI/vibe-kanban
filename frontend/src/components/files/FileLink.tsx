import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FileCode } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFileBrowserStore } from '@/stores/useFileBrowserStore';

/**
 * Regex to detect file paths in text
 * Matches patterns like:
 * - /path/to/file.ts
 * - ./relative/path.rs
 * - src/components/File.tsx
 * - file.ts:42 (with line number)
 * - file.ts:42:10 (with column)
 */
export const FILE_PATH_REGEX =
  /(?:^|[\s"'`([{])((\.\/|\.\.\/|\/)?[\w.-]+(?:\/[\w.-]+)*\.[a-zA-Z]{1,10})(?::(\d+)(?::(\d+))?)?(?=[\s"'`)\]}:,]|$)/g;

/**
 * Parse file path from text, extracting path, line, and column
 */
export function parseFilePath(text: string): {
  path: string;
  line?: number;
  column?: number;
} | null {
  // Reset regex state
  FILE_PATH_REGEX.lastIndex = 0;
  const match = FILE_PATH_REGEX.exec(text);
  if (!match) return null;

  return {
    path: match[1],
    line: match[3] ? parseInt(match[3], 10) : undefined,
    column: match[4] ? parseInt(match[4], 10) : undefined,
  };
}

/**
 * Check if a string looks like a file path
 */
export function looksLikeFilePath(text: string): boolean {
  // Must contain a dot for extension
  if (!text.includes('.')) return false;

  // Must have a reasonable extension
  const extMatch = text.match(/\.([a-zA-Z]{1,10})(?::\d+)?(?::\d+)?$/);
  if (!extMatch) return false;

  // Common code file extensions
  const codeExtensions = new Set([
    'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
    'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift',
    'c', 'cpp', 'h', 'hpp', 'cs',
    'php', 'vue', 'svelte',
    'json', 'yaml', 'yml', 'toml', 'xml',
    'md', 'mdx', 'txt', 'html', 'css', 'scss', 'sass', 'less',
    'sql', 'graphql', 'gql',
    'sh', 'bash', 'zsh', 'fish',
    'dockerfile', 'makefile',
    'env', 'gitignore', 'editorconfig',
  ]);

  const ext = extMatch[1].toLowerCase();
  return codeExtensions.has(ext);
}

interface FileLinkProps {
  /** The file path to display/link to */
  path: string;
  /** Optional line number */
  line?: number;
  /** Optional column number */
  column?: number;
  /** Children to render (defaults to path display) */
  children?: React.ReactNode;
  /** Additional class name */
  className?: string;
}

/**
 * Clickable file reference component
 * When clicked, opens the file in the files panel
 */
export function FileLink({
  path,
  line,
  column,
  children,
  className,
}: FileLinkProps) {
  const [, setSearchParams] = useSearchParams();
  const { setSelectedFile, setSource } = useFileBrowserStore();

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Set the file in the store
      setSelectedFile(path);

      // Switch to files view
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('view', 'files');
        if (line) {
          next.set('line', String(line));
        }
        return next;
      });

      // Default to worktree source for conversation file references
      setSource('worktree');
    },
    [path, line, setSelectedFile, setSearchParams, setSource]
  );

  // Display text: show line/column if present
  const displayText = children ?? (
    <>
      {path}
      {line && (
        <span className="text-muted-foreground">
          :{line}
          {column && `:${column}`}
        </span>
      )}
    </>
  );

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'inline-flex items-center gap-1',
        'text-primary hover:underline',
        'rounded-sm bg-muted/50 px-1 py-0.5',
        'transition-colors hover:bg-muted',
        'font-mono text-sm',
        'cursor-pointer',
        className
      )}
      title={`Open ${path}${line ? ` at line ${line}` : ''}`}
    >
      <FileCode className="h-3 w-3 flex-shrink-0" />
      {displayText}
    </button>
  );
}

export default FileLink;
