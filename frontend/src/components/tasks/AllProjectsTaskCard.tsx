import { useCallback, useRef } from 'react';
import { KanbanCard } from '@/components/ui/shadcn-io/kanban';
import {
  CheckCircle,
  FolderOpen,
  Loader2,
  Server,
  User,
  XCircle,
} from 'lucide-react';
import type { TaskWithProjectInfo } from 'shared/types';
import { TaskCardHeader } from './TaskCardHeader';

interface AllProjectsTaskCardProps {
  task: TaskWithProjectInfo;
  index: number;
  status: string;
  onViewDetails: (task: TaskWithProjectInfo) => void;
}

/**
 * Get short node name from full hostname (e.g., "justX" from "justX.raverx.net")
 */
function getShortNodeName(nodeName: string | null | undefined): string | null {
  if (!nodeName) return null;
  const dotIndex = nodeName.indexOf('.');
  return dotIndex > 0 ? nodeName.substring(0, dotIndex) : nodeName;
}

export function AllProjectsTaskCard({
  task,
  index,
  status,
  onViewDetails,
}: AllProjectsTaskCardProps) {
  const localRef = useRef<HTMLDivElement>(null);

  const handleClick = useCallback(() => {
    onViewDetails(task);
  }, [task, onViewDetails]);

  const shortNodeName = getShortNodeName(task.source_node_name);
  const ownerName =
    task.remote_assignee_name ?? task.remote_assignee_username ?? null;

  return (
    <KanbanCard
      key={task.id}
      id={task.id}
      name={task.title}
      index={index}
      parent={status}
      onClick={handleClick}
      forwardedRef={localRef}
      className={
        task.is_remote
          ? 'relative overflow-hidden pl-5 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-purple-400 before:content-[""]'
          : undefined
      }
    >
      <div className="flex flex-col gap-2">
        <TaskCardHeader
          title={task.title}
          avatar={
            task.remote_assignee_name
              ? {
                  firstName:
                    task.remote_assignee_name.split(' ')[0] ?? undefined,
                  lastName:
                    task.remote_assignee_name.split(' ').slice(1).join(' ') ||
                    undefined,
                  username: task.remote_assignee_username ?? undefined,
                }
              : undefined
          }
          right={
            <>
              {task.has_in_progress_attempt && (
                <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
              )}
              {task.has_merged_attempt && (
                <CheckCircle className="h-4 w-4 text-green-500" />
              )}
              {task.last_attempt_failed && !task.has_merged_attempt && (
                <XCircle className="h-4 w-4 text-destructive" />
              )}
            </>
          }
        />

        {task.description && (
          <p className="text-sm text-secondary-foreground break-words">
            {task.description.length > 100
              ? `${task.description.substring(0, 100)}...`
              : task.description}
          </p>
        )}

        {/* Project, owner, and node info */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {/* Project name */}
          <div className="flex items-center gap-1">
            <FolderOpen className="h-3 w-3" />
            <span className="truncate max-w-[120px]">{task.project_name}</span>
          </div>

          {/* Owner/assignee */}
          {ownerName && (
            <div className="flex items-center gap-1">
              <User className="h-3 w-3" />
              <span className="truncate max-w-[100px]">{ownerName}</span>
            </div>
          )}

          {/* Node (short hostname) */}
          {shortNodeName && (
            <div className="flex items-center gap-1">
              <Server className="h-3 w-3" />
              <span>{shortNodeName}</span>
            </div>
          )}
        </div>
      </div>
    </KanbanCard>
  );
}
