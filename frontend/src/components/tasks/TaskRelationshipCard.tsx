import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Loader2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Task } from 'shared/types';

interface TaskRelationshipCardProps {
  task: Task;
  isCurrentTask?: boolean;
  onClick?: () => void;
  className?: string;
}

export function TaskRelationshipCard({
  task,
  isCurrentTask = false,
  onClick,
  className,
}: TaskRelationshipCardProps) {
  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'todo':
        return 'secondary';
      case 'inprogress':
        return 'default';
      case 'inreview':
        return 'outline';
      case 'done':
        return 'default';
      case 'cancelled':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  const truncateTitle = (title: string, maxLength: number = 35) => {
    return title.length > maxLength
      ? `${title.substring(0, maxLength)}...`
      : title;
  };

  const truncateDescription = (
    description: string | null,
    maxLength: number = 80
  ) => {
    if (!description) return null;
    return description.length > maxLength
      ? `${description.substring(0, maxLength)}...`
      : description;
  };

  return (
    <Card
      className={cn(
        'p-3 transition-all duration-200 cursor-pointer hover:shadow-md border',
        'min-h-[80px] max-w-[280px]', // Compact size for DAG
        isCurrentTask && 'bg-accent/10 border-accent ring-1 ring-accent/50',
        !isCurrentTask && 'hover:bg-accent/5',
        className
      )}
      onClick={onClick}
    >
      <div className="flex flex-col space-y-2">
        {/* Title and Status Row */}
        <div className="flex items-start justify-between gap-2">
          <h4 className="font-medium text-sm leading-tight flex-1 min-w-0">
            {truncateTitle(task.title)}
          </h4>
          <div className="flex items-center space-x-1 shrink-0">
            {/* Status indicators - simplified for compactness */}
            <Badge
              variant={getStatusBadgeVariant(task.status)}
              className="text-xs px-1.5 py-0.5 h-auto"
            >
              {task.status}
            </Badge>
          </div>
        </div>

        {/* Description */}
        {task.description && (
          <p className="text-xs text-muted-foreground leading-relaxed">
            {truncateDescription(task.description)}
          </p>
        )}

        {/* Current task indicator */}
        {isCurrentTask && (
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            <span className="text-xs text-accent-foreground font-medium">
              Current Task
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}
