import { useTranslation } from 'react-i18next';
import { GithubLogoIcon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { Tooltip } from '../primitives/Tooltip';
import { FileTreeSearchBar } from './FileTreeSearchBar';
import { FileTreeNode } from './FileTreeNode';
import type { TreeNode } from '../types/fileTree';

interface FileTreeProps {
  nodes: TreeNode[];
  collapsedPaths: Set<string>;
  onToggleExpand: (path: string) => void;
  selectedPath?: string | null;
  onSelectFile?: (path: string) => void;
  onNodeRef?: (path: string, el: HTMLDivElement | null) => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  isAllExpanded: boolean;
  onToggleExpandAll: () => void;
  className?: string;
  /** Whether to show GitHub comments */
  showGitHubComments?: boolean;
  /** Callback to toggle GitHub comments visibility */
  onToggleGitHubComments?: (show: boolean) => void;
  /** Function to get comment count for a file path (handles prefixed paths) */
  getGitHubCommentCountForFile?: (filePath: string) => number;
  /** Whether GitHub comments are currently loading */
  isGitHubCommentsLoading?: boolean;
}

export function FileTree({
  nodes,
  collapsedPaths,
  onToggleExpand,
  selectedPath,
  onSelectFile,
  onNodeRef,
  searchQuery,
  onSearchChange,
  isAllExpanded,
  onToggleExpandAll,
  className,
  showGitHubComments,
  onToggleGitHubComments,
  getGitHubCommentCountForFile,
  isGitHubCommentsLoading,
}: FileTreeProps) {
  const { t } = useTranslation(['tasks', 'common']);

  const renderNodes = (nodeList: TreeNode[], depth = 0) => {
    return nodeList.map((node) => (
      <div key={node.id}>
        <FileTreeNode
          ref={
            node.type === 'file' && onNodeRef
              ? (el) => onNodeRef(node.path, el)
              : undefined
          }
          node={node}
          depth={depth}
          isExpanded={!collapsedPaths.has(node.path)}
          isSelected={selectedPath === node.path}
          onToggle={
            node.type === 'folder' ? () => onToggleExpand(node.path) : undefined
          }
          onSelect={
            node.type === 'file' && onSelectFile
              ? () => onSelectFile(node.path)
              : undefined
          }
          commentCount={getGitHubCommentCountForFile?.(node.path)}
          showCommentBadge={showGitHubComments}
        />
        {node.type === 'folder' &&
          node.children &&
          !collapsedPaths.has(node.path) &&
          renderNodes(node.children, depth + 1)}
      </div>
    ));
  };

  return (
    <div className={cn('flex-1 w-full bg-secondary flex flex-col', className)}>
      <div className="px-base pt-base">
        <div className="flex items-center gap-half">
          <div className="flex-1">
            <FileTreeSearchBar
              searchQuery={searchQuery}
              onSearchChange={onSearchChange}
              isAllExpanded={isAllExpanded}
              onToggleExpandAll={onToggleExpandAll}
            />
          </div>
          {onToggleGitHubComments && (
            <Tooltip
              content={
                showGitHubComments
                  ? t('common:fileTree.hideGitHubComments')
                  : t('common:fileTree.showGitHubComments')
              }
            >
              <button
                type="button"
                onClick={() => onToggleGitHubComments(!showGitHubComments)}
                className={cn(
                  'p-1 rounded hover:bg-panel transition-colors shrink-0',
                  showGitHubComments ? 'text-normal' : 'text-low',
                  isGitHubCommentsLoading && 'opacity-50 animate-pulse'
                )}
                aria-label={
                  showGitHubComments
                    ? t('common:fileTree.hideGitHubComments')
                    : t('common:fileTree.showGitHubComments')
                }
              >
                <GithubLogoIcon className="size-icon-sm" weight="fill" />
              </button>
            </Tooltip>
          )}
        </div>
      </div>
      <div className="p-base flex-1 min-h-0 overflow-auto scrollbar-thin scrollbar-thumb-panel scrollbar-track-transparent">
        {nodes.length > 0 ? (
          renderNodes(nodes)
        ) : (
          <div className="p-base text-low text-sm">
            {searchQuery ? t('common:fileTree.noResults') : 'No changed files'}
          </div>
        )}
      </div>
    </div>
  );
}
