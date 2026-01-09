import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { FileTreeSearchBar } from './FileTreeSearchBar';
import { FileTreeNode } from './FileTreeNode';
import type { TreeNode } from '../types/fileTree';
import { CollapsibleSectionHeader } from '../primitives/CollapsibleSectionHeader';
import { PERSIST_KEYS } from '@/stores/useUiPreferencesStore';

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
        />
        {node.type === 'folder' &&
          node.children &&
          !collapsedPaths.has(node.path) &&
          renderNodes(node.children, depth + 1)}
      </div>
    ));
  };

  return (
    <div className={cn('w-full h-full bg-secondary flex flex-col', className)}>
      <CollapsibleSectionHeader
        title="Changes"
        persistKey={PERSIST_KEYS.changesSection}
        contentClassName="flex flex-col flex-1 min-h-0"
      >
        <div className="px-base pt-base">
          <FileTreeSearchBar
            searchQuery={searchQuery}
            onSearchChange={onSearchChange}
            isAllExpanded={isAllExpanded}
            onToggleExpandAll={onToggleExpandAll}
          />
        </div>
        <div className="p-base flex-1 min-h-0 overflow-auto scrollbar-thin scrollbar-thumb-panel scrollbar-track-transparent">
          {nodes.length > 0 ? (
            renderNodes(nodes)
          ) : (
            <div className="p-base text-low text-sm">
              {searchQuery
                ? t('common:fileTree.noResults')
                : 'No changed files'}
            </div>
          )}
        </div>
      </CollapsibleSectionHeader>
    </div>
  );
}
