import { memo, useState } from 'react';
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
import { Plus, MoreHorizontal, ChevronRight, ChevronDown } from 'lucide-react';
import type { TaskStatus, TaskWithAttemptStatus } from 'shared/types';
import { StatusIcon } from '@/utils/statusIcons';
import { LinearIssueCard } from './LinearIssueCard';
import { statusLabels } from '@/utils/statusLabels';

// Column configuration - which columns are shown by default
const VISIBLE_COLUMNS: TaskStatus[] = ['inprogress', 'done'];
const HIDDEN_COLUMNS: TaskStatus[] = ['todo', 'inreview', 'cancelled'];

interface ColumnItem {
  task: TaskWithAttemptStatus;
  issueKey?: string;
  projectName?: string;
}

interface TeamKanbanBoardProps {
  columns: Record<TaskStatus, ColumnItem[]>;
  onDragEnd: (event: DragEndEvent) => void;
  onViewTaskDetails: (task: TaskWithAttemptStatus) => void;
  onCreateTask?: () => void;
  selectedTaskId?: string;
}

interface KanbanColumnProps {
  status: TaskStatus;
  items: ColumnItem[];
  onViewTaskDetails: (task: TaskWithAttemptStatus) => void;
  onCreateTask?: () => void;
  selectedTaskId?: string;
}

function KanbanColumn({
  status,
  items,
  onViewTaskDetails,
  onCreateTask,
  selectedTaskId,
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
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-foreground"
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
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
              onViewDetails={onViewTaskDetails}
              isSelected={selectedTaskId === item.task.id}
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
}

function HiddenColumnsSection({ columns, hiddenStatuses }: HiddenColumnsSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);

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
            <div
              key={status}
              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent/50 cursor-pointer"
            >
              <StatusIcon status={status} />
              <span className="text-sm">{statusLabels[status]}</span>
              {columns[status]?.length > 0 && (
                <span className="text-xs text-muted-foreground ml-auto">
                  {columns[status].length}
                </span>
              )}
            </div>
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
}: TeamKanbanBoardProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  return (
    <DndContext
      collisionDetection={rectIntersection}
      onDragEnd={onDragEnd}
      sensors={sensors}
    >
      <div className="flex h-full gap-0">
        {/* Visible Columns */}
        <div className="flex divide-x border-x">
          {VISIBLE_COLUMNS.map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              items={columns[status] || []}
              onViewTaskDetails={onViewTaskDetails}
              onCreateTask={onCreateTask}
              selectedTaskId={selectedTaskId}
            />
          ))}
        </div>

        {/* Hidden Columns Section */}
        <HiddenColumnsSection columns={columns} hiddenStatuses={HIDDEN_COLUMNS} />
      </div>
    </DndContext>
  );
}

export const TeamKanbanBoard = memo(TeamKanbanBoardComponent);
