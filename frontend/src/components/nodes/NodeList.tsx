import { NodeCard } from './NodeCard';
import type { Node } from '@/types/nodes';
import { Server } from 'lucide-react';

interface NodeListProps {
  nodes: Node[];
  isLoading?: boolean;
  onNodeClick?: (node: Node) => void;
}

export function NodeList({ nodes, isLoading, onNodeClick }: NodeListProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="h-40 rounded-lg bg-muted animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Server className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium">No nodes registered</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Nodes will appear here when they connect to the hive.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {nodes.map((node) => (
        <NodeCard
          key={node.id}
          node={node}
          onClick={onNodeClick ? () => onNodeClick(node) : undefined}
        />
      ))}
    </div>
  );
}
