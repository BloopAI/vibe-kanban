import { memo, useCallback, useRef, useEffect } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { TaskWithAttemptStatus, TaskStatus } from 'shared/types';
import { StatusIcon } from '@/utils/statusIcons';
import {
  PrioritySelector,
  type TeamMember,
  type PriorityValue,
} from '@/components/selectors';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { User, X, Check } from 'lucide-react';

// Simple project type for dropdown
export interface TeamProject {
  id: string;
  name: string;
}

interface LinearIssueCardProps {
  task: TaskWithAttemptStatus;
  index: number;
  status: TaskStatus;
  issueKey?: string; // e.g., "VIB-1"
  projectName?: string;
  projectId?: string;
  onViewDetails: (task: TaskWithAttemptStatus) => void;
  isSelected?: boolean;
  teamMembers?: TeamMember[];
  teamProjects?: TeamProject[];
  onAssigneeChange?: (taskId: string, assigneeId: string | null) => void;
  onPriorityChange?: (taskId: string, priority: number) => void;
  onProjectChange?: (taskId: string, projectId: string) => void;
}

function LinearIssueCardComponent({
  task,
  index,
  status,
  issueKey,
  projectName,
  projectId,
  onViewDetails,
  isSelected,
  teamMembers = [],
  teamProjects = [],
  onAssigneeChange,
  onPriorityChange,
  onProjectChange,
}: LinearIssueCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { index, parent: status },
  });

  const combinedRef = useCallback(
    (node: HTMLDivElement | null) => {
      setNodeRef(node);
      (cardRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    },
    [setNodeRef]
  );

  useEffect(() => {
    if (isSelected && cardRef.current) {
      cardRef.current.scrollIntoView({
        block: 'center',
        inline: 'nearest',
        behavior: 'smooth',
      });
    }
  }, [isSelected]);

  const handleClick = useCallback(() => {
    onViewDetails(task);
  }, [task, onViewDetails]);

  const handleAssigneeChange = useCallback((assigneeId: string | null) => {
    onAssigneeChange?.(task.id, assigneeId);
  }, [task.id, onAssigneeChange]);

  const handlePriorityChange = useCallback((priority: PriorityValue) => {
    onPriorityChange?.(task.id, priority);
  }, [task.id, onPriorityChange]);

  const handleProjectChange = useCallback((newProjectId: string) => {
    onProjectChange?.(task.id, newProjectId);
  }, [task.id, onProjectChange]);

  // Get assigned member info
  const selectedMember = task.assignee_id
    ? teamMembers.find((m) => m.id === task.assignee_id)
    : undefined;
  const hasAssigneeAvatar = !!selectedMember?.avatar;

  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  // Debug: if assignee_id exists but no match found, show ID prefix as fallback
  const hasAssignee = !!task.assignee_id;
  const assigneeInitials = selectedMember
    ? getInitials(selectedMember.name)
    : hasAssignee
      ? task.assignee_id!.slice(0, 2).toUpperCase()
      : null;

  // Get priority value for display
  const priorityValue = (task.priority ?? 0) as PriorityValue;

  return (
    <Card
      ref={combinedRef}
      {...listeners}
      {...attributes}
      onClick={handleClick}
      className={cn(
        'p-3 cursor-pointer transition-all duration-150',
        'bg-card hover:bg-accent/30 border border-border/50',
        'rounded-lg shadow-sm',
        isDragging && 'opacity-50 cursor-grabbing shadow-lg',
        isSelected && 'ring-2 ring-primary ring-offset-1'
      )}
      style={{
        zIndex: isDragging ? 1000 : 1,
        transform: transform
          ? `translateX(${transform.x}px) translateY(${transform.y}px)`
          : 'none',
      }}
    >
      <div className="flex flex-col gap-2">
        {/* Top row: Issue ID and Assignee */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground font-mono font-medium">
            {issueKey || task.id.slice(0, 8).toUpperCase()}
          </span>

          {/* Assignee Selector - Custom with proper initials */}
          <div onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild disabled={!onAssigneeChange}>
                <button
                  className={cn(
                    'h-6 w-6 rounded-full flex items-center justify-center overflow-hidden',
                    'border border-dashed border-muted-foreground/40',
                    'text-muted-foreground hover:border-primary hover:text-primary',
                    'transition-colors text-xs font-medium',
                    hasAssignee && !hasAssigneeAvatar && 'border-solid bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-700',
                    hasAssigneeAvatar && 'border-none p-0'
                  )}
                  title={selectedMember ? selectedMember.name : hasAssignee ? `Assigned: ${task.assignee_id}` : 'Assign'}
                >
                  {hasAssigneeAvatar ? (
                    <img src={selectedMember!.avatar} alt={selectedMember!.name} className="h-6 w-6 rounded-full object-cover" />
                  ) : assigneeInitials ? (
                    assigneeInitials
                  ) : (
                    <User className="h-3.5 w-3.5" />
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {/* Unassign option */}
                <DropdownMenuItem
                  onClick={() => handleAssigneeChange(null)}
                  className={cn('cursor-pointer gap-2', !task.assignee_id && 'bg-accent')}
                >
                  <div className="h-6 w-6 rounded-full border border-dashed border-muted-foreground/40 flex items-center justify-center">
                    <X className="h-3 w-3 text-muted-foreground" />
                  </div>
                  <span>No assignee</span>
                  <span className="ml-auto text-xs text-muted-foreground font-mono">0</span>
                </DropdownMenuItem>

                {teamMembers.length > 0 && <DropdownMenuSeparator />}

                {/* Team members */}
                {teamMembers.map((member, idx) => {
                  const isSelected = task.assignee_id === member.id;
                  const shortcut = idx < 9 ? String(idx + 1) : undefined;
                  return (
                    <DropdownMenuItem
                      key={member.id}
                      onClick={() => handleAssigneeChange(member.id)}
                      className={cn('cursor-pointer gap-2', isSelected && 'bg-accent')}
                    >
                      <div className="h-6 w-6 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 flex items-center justify-center text-xs font-medium">
                        {getInitials(member.name)}
                      </div>
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="truncate">{member.name}</span>
                        {member.email && (
                          <span className="text-xs text-muted-foreground truncate">{member.email}</span>
                        )}
                      </div>
                      {shortcut && (
                        <span className="text-xs text-muted-foreground font-mono">{shortcut}</span>
                      )}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Title row with status icon only */}
        <div className="flex items-start gap-2">
          <StatusIcon status={status} className="mt-0.5 shrink-0" />
          <h4 className="text-sm font-medium leading-snug line-clamp-2">
            {task.title}
          </h4>
        </div>

        {/* Bottom row: Project and Priority labels */}
        <div className="flex items-center gap-1.5 mt-1">
          {/* Project Selector - clickable dropdown */}
          <div onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild disabled={!onProjectChange || teamProjects.length === 0}>
                <button
                  className={cn(
                    'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs',
                    'bg-muted/50 border border-border/50',
                    'transition-colors hover:bg-accent/50 hover:border-border',
                    projectName ? 'text-indigo-600 dark:text-indigo-400' : 'text-muted-foreground'
                  )}
                  title={projectName || 'Select project'}
                >
                  <svg
                    className="h-3 w-3"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                  >
                    <path d="M8 0L14.928 4v8L8 16 1.072 12V4L8 0z" fillOpacity="0.3" />
                    <path d="M8 2l5.196 3v6L8 14 2.804 11V5L8 2z" />
                  </svg>
                  {projectName || 'Project'}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {teamProjects.length === 0 ? (
                  <DropdownMenuItem disabled className="text-muted-foreground">
                    No projects available
                  </DropdownMenuItem>
                ) : (
                  teamProjects.map((project) => {
                    const isCurrentProject = project.id === projectId;
                    return (
                      <DropdownMenuItem
                        key={project.id}
                        onClick={() => handleProjectChange(project.id)}
                        className={cn('cursor-pointer gap-2', isCurrentProject && 'bg-accent')}
                      >
                        <svg
                          className="h-3.5 w-3.5 text-indigo-500"
                          viewBox="0 0 16 16"
                          fill="currentColor"
                        >
                          <path d="M8 0L14.928 4v8L8 16 1.072 12V4L8 0z" fillOpacity="0.3" />
                          <path d="M8 2l5.196 3v6L8 14 2.804 11V5L8 2z" />
                        </svg>
                        <span className="flex-1 truncate">{project.name}</span>
                        {isCurrentProject && (
                          <Check className="h-4 w-4 text-primary" />
                        )}
                      </DropdownMenuItem>
                    );
                  })
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Priority/Severity Selector - same row as other labels */}
          <div onClick={(e) => e.stopPropagation()}>
            <PrioritySelector
              value={priorityValue}
              onChange={handlePriorityChange}
              variant="pill"
              disabled={!onPriorityChange}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}

export const LinearIssueCard = memo(LinearIssueCardComponent);
