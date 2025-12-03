import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { NodeStatusBadge } from './NodeStatusBadge';
import type { Node } from '@/types/nodes';
import { Server, Cpu, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface NodeCardProps {
  node: Node;
  onClick?: () => void;
}

export function NodeCard({ node, onClick }: NodeCardProps) {
  const lastSeen = node.last_heartbeat_at
    ? formatDistanceToNow(new Date(node.last_heartbeat_at), { addSuffix: true })
    : 'Never';

  return (
    <Card
      className={`hover:shadow-md transition-shadow ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Server className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">{node.name}</CardTitle>
          </div>
          <NodeStatusBadge status={node.status} />
        </div>
        <CardDescription className="flex items-center gap-1 text-xs">
          <Clock className="h-3 w-3" />
          Last seen {lastSeen}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Cpu className="h-4 w-4" />
            <span>
              {node.capabilities.os || 'Unknown OS'} /{' '}
              {node.capabilities.arch || 'Unknown arch'}
            </span>
          </div>
          {node.capabilities.executors.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {node.capabilities.executors.map((executor) => (
                <span
                  key={executor}
                  className="px-1.5 py-0.5 text-xs bg-secondary rounded"
                >
                  {executor}
                </span>
              ))}
            </div>
          )}
          {node.public_url && (
            <div className="text-xs text-muted-foreground truncate">
              {node.public_url}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
