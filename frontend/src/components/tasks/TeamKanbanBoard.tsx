import { memo, useState, useCallback } from 'react';
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  rectIntersection,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus, MoreHorizontal, ChevronRight, ChevronDown, EyeOff } from 'lucide-react';
import type { TaskStatus, TaskWithAttemptStatus } from 'shared/types';
import { StatusIcon } from '@/utils/statusIcons';
import { LinearIssueCard, type TeamProject } from './LinearIssueCard';
import { statusLabels } from '@/utils/statusLabels';
import type { TeamMember } from '@/components/selectors';

// Default column configuration
const DEFAULT_VISIBLE: TaskStatus[] = ['todo', 'inprogress', 'done'];
const ALL_STATUSES: TaskStatus[] = ['todo', 'inprogress', 'inreview', 'done', 'cancelled'];

interface ColumnItem {
  task: TaskWithAttemptStatus;
  issueKey?: string;
  projectName?: string;
  projectId?: string;
  component?: string | null;
}

interface TeamKanbanBoardProps {
  columns: Record<TaskStatus, ColumnItem[]>;
  onDragEnd: (event: DragEndEvent) => void;
  onViewTaskDetails: (task: TaskWithAttemptStatus) => void;
  onCreateTask?: () => void;
  selectedTaskId?: string;
  teamMembers?: TeamMember[];
  teamProjects?: TeamProject[];
  onAssigneeChange?: (taskId: string, assigneeId: string | null) => void;
  onPriorityChange?: (taskId: string, priority: number) => void;
  onComponentChange?: (taskId: string, component: string | null) => void;
  onProjectChange?: (taskId: string, projectId: string) => void;
}

interface KanbanColumnProps {
  status: TaskStatus;
  items: ColumnItem[];
  onViewTaskDetails: (task: TaskWithAttemptStatus) => void;
  onCreateTask?: () => void;
  onHideColumn?: (status: TaskStatus) => void;
  selectedTaskId?: string;
  teamMembers?: TeamMember[];
  teamProjects?: TeamProject[];
  onAssigneeChange?: (taskId: string, assigneeId: string | null) => void;
  onPriorityChange?: (taskId: string, priority: number) => void;
  onComponentChange?: (taskId: string, component: string | null) => void;
  onProjectChange?: (taskId: string, projectId: string) => void;
}

function KanbanColumn({
  status,
  items,
  onViewTaskDetails,
  onCreateTask,
  onHideColumn,
  selectedTaskId,
  teamMembers,
  teamProjects,
  onAssigneeChange,
  onPriorityChange,
  onComponentChange,
  onProjectChange,
}: KanbanColumnProps) {
  const { isOver, setNodeRef } = useDroppable({ id: status });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex flex-col min-w-[280px] max-w-[320px] h-full',
        isOver && 'bg-accent/20'
      )}
    >
      {/* Column Header */}
      <div className="flex items-center gap-2 px-2 py-3 sticky top-0 bg-background z-10">
        <StatusIcon status={status} />
        <span className="font-medium text-sm">{statusLabels[status]}</span>
        <span className="text-sm text-muted-foreground">{items.length}</span>
        <div className="flex-1" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => onHideColumn?.(status)}
              className="cursor-pointer"
            >
              <EyeOff className="h-4 w-4 mr-2" />
              Hide column
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-foreground"
          onClick={onCreateTask}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Cards Container */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        <div className="flex flex-col gap-2">
          {items.map((item, index) => (
            <LinearIssueCard
              key={item.task.id}
              task={item.task}
              index={index}
              status={status}
              issueKey={item.issueKey}
              projectName={item.projectName}
              projectId={item.projectId || item.task.project_id}
              component={item.component}
              onViewDetails={onViewTaskDetails}
              isSelected={selectedTaskId === item.task.id}
              teamMembers={teamMembers}
              teamProjects={teamProjects}
              onAssigneeChange={onAssigneeChange}
              onPriorityChange={onPriorityChange}
              onComponentChange={onComponentChange}
              onProjectChange={onProjectChange}
            />
          ))}
        </div>

        {/* Add Card Button at bottom */}
        <button
          onClick={onCreateTask}
          className="w-full mt-2 py-2 flex items-center justify-center gap-1 text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded-lg border border-dashed border-border/50 transition-colors"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

interface HiddenColumnsSectionProps {
  columns: Record<TaskStatus, ColumnItem[]>;
  hiddenStatuses: TaskStatus[];
  onShowColumn: (status: TaskStatus) => void;
}

function HiddenColumnsSection({ columns, hiddenStatuses, onShowColumn }: HiddenColumnsSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (hiddenStatuses.length === 0) {
    return null;
  }

  return (
    <div className="min-w-[200px] border-l pl-4">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 py-3 text-sm text-muted-foreground hover:text-foreground"
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
        Hidden columns
      </button>

      {isExpanded && (
        <div className="flex flex-col gap-1 mt-2">
          {hiddenStatuses.map((status) => (
            <button
              key={status}
              onClick={() => onShowColumn(status)}
              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent/50 cursor-pointer text-left transition-colors"
              title={`Click to show ${statusLabels[status]} column`}
            >
              <StatusIcon status={status} />
              <span className="text-sm">{statusLabels[status]}</span>
              {columns[status]?.length > 0 && (
                <span className="text-xs text-muted-foreground ml-auto bg-muted px-1.5 py-0.5 rounded">
                  {columns[status].length}
                </span>
              )}
              <Plus className="h-3 w-3 text-muted-foreground ml-1" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TeamKanbanBoardComponent({
  columns,
  onDragEnd,
  onViewTaskDetails,
  onCreateTask,
  selectedTaskId,
  teamMembers,
  teamProjects,
  onAssigneeChange,
  onPriorityChange,
  onComponentChange,
  onProjectChange,
}: TeamKanbanBoardProps) {
  const [visibleStatuses, setVisibleStatuses] = useState<TaskStatus[]>(DEFAULT_VISIBLE);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const hiddenStatuses = ALL_STATUSES.filter((s) => !visibleStatuses.includes(s));

  const handleShowColumn = useCallback((status: TaskStatus) => {
    setVisibleStatuses((prev) => {
      if (prev.includes(status)) return prev;
      // Insert in the correct order based on ALL_STATUSES
      const newVisible = [...prev, status];
      return ALL_STATUSES.filter((s) => newVisible.includes(s));
    });
  }, []);

  const handleHideColumn = useCallback((status: TaskStatus) => {
    setVisibleStatuses((prev) => {
      // Don't allow hiding if only one column is visible
      if (prev.length <= 1) return prev;
      return prev.filter((s) => s !== status);
    });
  }, []);

  return (
    <DndContext
      collisionDetection={rectIntersection}
      onDragEnd={onDragEnd}
      sensors={sensors}
    >
      <div className="flex h-full gap-0">
        {/* Visible Columns */}
        <div className="flex divide-x border-x">
          {visibleStatuses.map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              items={columns[status] || []}
              onViewTaskDetails={onViewTaskDetails}
              onCreateTask={onCreateTask}
              onHideColumn={handleHideColumn}
              selectedTaskId={selectedTaskId}
              teamMembers={teamMembers}
              teamProjects={teamProjects}
              onAssigneeChange={onAssigneeChange}
              onPriorityChange={onPriorityChange}
              onComponentChange={onComponentChange}
              onProjectChange={onProjectChange}
            />
          ))}
        </div>

        {/* Hidden Columns Section */}
        <HiddenColumnsSection
          columns={columns}
          hiddenStatuses={hiddenStatuses}
          onShowColumn={handleShowColumn}
        />
      </div>
    </DndContext>
  );
}

export const TeamKanbanBoard = memo(TeamKanbanBoardComponent);
