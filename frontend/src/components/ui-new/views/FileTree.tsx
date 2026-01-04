import { cn } from '@/lib/utils';
import { FileTreeSearchBar } from './FileTreeSearchBar';
import { FileTreeNode } from './FileTreeNode';
import type { TreeNode } from '../types/fileTree';
import { SectionHeader } from '../primitives/SectionHeader';

interface FileTreeProps {
  nodes: TreeNode[];
  expandedPaths: Set<string>;
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
  expandedPaths,
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
          isExpanded={expandedPaths.has(node.path)}
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
          expandedPaths.has(node.path) &&
          renderNodes(node.children, depth + 1)}
      </div>
    ));
  };

  return (
    <div className={cn('w-full h-full bg-secondary flex flex-col', className)}>
      <SectionHeader title="Changes" />
      <div className="px-base pt-base">
        <FileTreeSearchBar
          searchQuery={searchQuery}
          onSearchChange={onSearchChange}
          isAllExpanded={isAllExpanded}
          onToggleExpandAll={onToggleExpandAll}
        />
      </div>
      <div className="p-base flex-1 min-h-0 overflow-y-auto scrollbar-thin scrollbar-thumb-panel scrollbar-track-transparent">
        {nodes.length > 0 ? (
          renderNodes(nodes)
        ) : (
          <div className="p-base text-low text-sm">
            {searchQuery ? 'No matching files' : 'No changed files'}
          </div>
        )}
      </div>
    </div>
  );
}
