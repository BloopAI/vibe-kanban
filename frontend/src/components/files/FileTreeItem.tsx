import { cn } from '@/lib/utils';
import { FileIcon } from './FileIcon';
import type { DirectoryEntry } from 'shared/types';

interface FileTreeItemProps {
  entry: DirectoryEntry;
  isSelected?: boolean;
  onSelect: (entry: DirectoryEntry) => void;
  className?: string;
}

/**
 * Single file/folder row in the file tree
 * Mobile-optimized with 48px touch targets
 */
export function FileTreeItem({
  entry,
  isSelected,
  onSelect,
  className,
}: FileTreeItemProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(entry)}
      className={cn(
        // Base styles
        'w-full flex items-center gap-3 px-3 py-3 text-left',
        // Touch target: min 48px height for mobile
        'min-h-[48px]',
        // Hover/focus states
        'hover:bg-accent focus:bg-accent focus:outline-none',
        'rounded-md transition-colors',
        // Selected state
        isSelected && 'bg-accent',
        // Cursor
        'cursor-pointer',
        className
      )}
      title={entry.name}
    >
      <FileIcon
        name={entry.name}
        isDirectory={entry.is_directory}
        isGitRepo={entry.is_git_repo}
      />
      <span className="flex-1 truncate text-sm">{entry.name}</span>
      {entry.is_git_repo && (
        <span className="text-xs text-green-600 bg-green-100 dark:bg-green-900/30 px-1.5 py-0.5 rounded flex-shrink-0">
          git
        </span>
      )}
    </button>
  );
}

export default FileTreeItem;
