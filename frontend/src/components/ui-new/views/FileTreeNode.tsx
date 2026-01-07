import { forwardRef } from 'react';
import {
  CaretDownIcon,
  CaretRightIcon,
  FolderSimpleIcon,
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { getFileIcon } from '@/utils/fileTypeIcon';
import { useTheme } from '@/components/ThemeProvider';
import { getActualTheme } from '@/utils/theme';
import type { TreeNode } from '../types/fileTree';

interface FileTreeNodeProps {
  node: TreeNode;
  depth: number;
  isExpanded?: boolean;
  isSelected?: boolean;
  onToggle?: () => void;
  onSelect?: () => void;
}

export const FileTreeNode = forwardRef<HTMLDivElement, FileTreeNodeProps>(
  function FileTreeNode(
    { node, depth, isExpanded = false, isSelected = false, onToggle, onSelect },
    ref
  ) {
    const { theme } = useTheme();
    const actualTheme = getActualTheme(theme);

    const isFolder = node.type === 'folder';
    const isDeleted = node.changeKind === 'deleted';
    const isAdded = node.changeKind === 'added';
    const isRenamed = node.changeKind === 'renamed';
    const isCopied = node.changeKind === 'copied';
    const FileIcon = isFolder ? null : getFileIcon(node.name, actualTheme);

    // Extract filename from path for renamed/copied display
    const getFileName = (path: string) => path.split('/').pop() || path;

    const handleClick = () => {
      if (isFolder && onToggle) {
        onToggle();
      } else if (!isFolder && onSelect) {
        onSelect();
      }
    };

    return (
      <div
        ref={ref}
        className={cn(
          'flex items-center h-[26px] cursor-pointer text-low hover:bg-panel rounded',
          'relative select-none',
          isSelected && 'bg-panel text-normal'
        )}
        onClick={handleClick}
      >
        {/* Indentation guides */}
        {depth > 0 && (
          <div className="absolute left-0 top-0 bottom-0 flex">
            {Array.from({ length: depth }).map((_, i) => (
              <div
                key={i}
                className="h-full w-3 flex justify-center"
                style={{ marginLeft: i === 0 ? '6px' : '0' }}
              >
                <div className="h-full border-l border-border" />
              </div>
            ))}
          </div>
        )}

        {/* Content with padding based on depth */}
        <div
          className="flex items-center gap-half flex-1 pr-base whitespace-nowrap"
          style={{ paddingLeft: `${depth * 12 + 6}px` }}
        >
          {/* Expand/collapse caret for folders */}
          <span className="w-3 flex items-center justify-center shrink-0">
            {isFolder &&
              (isExpanded ? (
                <CaretDownIcon className="size-icon-xs" weight="fill" />
              ) : (
                <CaretRightIcon className="size-icon-xs" weight="fill" />
              ))}
          </span>

          {/* Icon */}
          <span className="shrink-0">
            {isFolder ? (
              <FolderSimpleIcon className="size-icon-sm" weight="fill" />
            ) : FileIcon ? (
              <FileIcon size={14} />
            ) : null}
          </span>

          {/* File/folder name - color based on change kind */}
          <span
            className={cn(
              'text-sm',
              isDeleted && 'text-error line-through',
              isAdded && 'text-success'
            )}
          >
            {node.name}
          </span>

          {/* Show old filename for renamed/copied files */}
          {(isRenamed || isCopied) && node.diff?.oldPath && (
            <span className="text-low text-sm shrink-0">
              ← {getFileName(node.diff.oldPath)}
            </span>
          )}

          {/* Stats for files */}
          {node.type === 'file' && (node.additions || node.deletions) && (
            <span className="text-sm shrink-0 ml-base">
              {node.additions != null && node.additions > 0 && (
                <span className="text-success">+{node.additions}</span>
              )}
              {node.additions != null &&
                node.additions > 0 &&
                node.deletions != null &&
                node.deletions > 0 &&
                ' '}
              {node.deletions != null && node.deletions > 0 && (
                <span className="text-error">-{node.deletions}</span>
              )}
            </span>
          )}
        </div>
      </div>
    );
  }
);
