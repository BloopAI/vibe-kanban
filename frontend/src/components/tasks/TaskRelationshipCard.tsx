import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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

  const truncateTitle = (title: string, maxLength: number = 50) => {
    return title.length > maxLength
      ? `${title.substring(0, maxLength)}...`
      : title;
  };

  const truncateDescription = (
    description: string | null,
    maxLength: number = 120
  ) => {
    if (!description) return null;
    return description.length > maxLength
      ? `${description.substring(0, maxLength)}...`
      : description;
  };

  return (
    <Card
      className={cn(
        'p-4 transition-all duration-200 cursor-pointer hover:shadow-md border',
        'min-h-[100px] w-full', // More spacious and responsive
        isCurrentTask && 'bg-accent/10 border-accent ring-1 ring-accent/50',
        !isCurrentTask && 'hover:bg-accent/5',
        onClick && 'cursor-pointer',
        !onClick && 'cursor-default',
        className
      )}
      onClick={onClick}
    >
      <div className="flex flex-col space-y-3">
        {/* Title and Status Row */}
        <div className="flex items-start justify-between gap-3">
          <h4
            className="font-medium text-sm leading-relaxed flex-1 min-w-0"
            title={task.title}
          >
            {truncateTitle(task.title)}
          </h4>
          <div className="flex items-center space-x-1 shrink-0">
            <Badge
              variant={getStatusBadgeVariant(task.status)}
              className="text-xs px-2 py-1 h-auto"
            >
              {task.status}
            </Badge>
          </div>
        </div>

        {/* Description */}
        {task.description && (
          <p
            className="text-xs text-muted-foreground leading-relaxed"
            title={task.description}
          >
            {truncateDescription(task.description)}
          </p>
        )}

        {/* Current task indicator */}
        {isCurrentTask && (
          <div className="flex items-center gap-2 pt-1">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-xs text-primary font-medium">
              Current Task
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}
