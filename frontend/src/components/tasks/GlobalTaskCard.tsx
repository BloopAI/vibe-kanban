import { useCallback } from 'react';
import { KanbanCard } from '@/components/ui/shadcn-io/kanban';
import { Loader2, XCircle } from 'lucide-react';
import type { GlobalTaskWithAttemptStatus } from 'shared/types';
import { Badge } from '@/components/ui/badge';
import { TaskCardHeader } from './TaskCardHeader';

export type ProjectColor = {
  border: string;
  bg: string;
  text: string;
};

export const PROJECT_COLORS: ProjectColor[] = [
  { border: 'border-blue-400', bg: 'bg-blue-50', text: 'text-blue-700' },
  { border: 'border-emerald-400', bg: 'bg-emerald-50', text: 'text-emerald-700' },
  { border: 'border-violet-400', bg: 'bg-violet-50', text: 'text-violet-700' },
  { border: 'border-amber-400', bg: 'bg-amber-50', text: 'text-amber-700' },
  { border: 'border-rose-400', bg: 'bg-rose-50', text: 'text-rose-700' },
  { border: 'border-cyan-400', bg: 'bg-cyan-50', text: 'text-cyan-700' },
  { border: 'border-fuchsia-400', bg: 'bg-fuchsia-50', text: 'text-fuchsia-700' },
  { border: 'border-lime-400', bg: 'bg-lime-50', text: 'text-lime-700' },
];

interface GlobalTaskCardProps {
  task: GlobalTaskWithAttemptStatus;
  index: number;
  status: string;
  onViewDetails: (task: GlobalTaskWithAttemptStatus) => void;
  projectColor: ProjectColor;
  isOpen?: boolean;
}

export function GlobalTaskCard({
  task,
  index,
  status,
  onViewDetails,
  projectColor,
  isOpen,
}: GlobalTaskCardProps) {
  const handleClick = useCallback(() => {
    onViewDetails(task);
  }, [task, onViewDetails]);

  return (
    <KanbanCard
      key={task.id}
      id={task.id}
      name={task.title}
      index={index}
      parent={status}
      onClick={handleClick}
      isOpen={isOpen}
    >
      <div className="flex flex-col gap-2">
        <Badge
          variant="outline"
          className={`w-fit text-xs border-2 ${projectColor.border} ${projectColor.bg} ${projectColor.text}`}
        >
          {task.project_name}
        </Badge>
        <TaskCardHeader
          title={task.title}
          right={
            <>
              {task.has_in_progress_attempt && (
                <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
              )}
              {task.last_attempt_failed && (
                <XCircle className="h-4 w-4 text-destructive" />
              )}
            </>
          }
        />
        {task.description && (
          <p className="text-sm text-secondary-foreground break-words">
            {task.description.length > 130
              ? `${task.description.substring(0, 130)}...`
              : task.description}
          </p>
        )}
      </div>
    </KanbanCard>
  );
}
