import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeaderCell,
} from '@/components/ui/table/table';
import { TaskTableRow } from './TaskTableRow';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useTaskProperties } from '@/hooks/useTaskProperties';
import type { TaskWithAttemptStatus, TaskStatus } from 'shared/types';
import type { SharedTaskRecord } from '@/hooks/useProjectTasks';
import type { KanbanColumnItem, KanbanColumns } from './TaskKanbanBoard';

const TASK_STATUSES: TaskStatus[] = [
  'todo',
  'inprogress',
  'inreview',
  'done',
  'cancelled',
];

interface TaskTableViewProps {
  columns: KanbanColumns;
  onViewTaskDetails: (task: TaskWithAttemptStatus) => void;
  onViewSharedTask?: (task: SharedTaskRecord) => void;
  selectedTaskId?: string;
  selectedSharedTaskId?: string | null;
  onCreateTask?: () => void;
}

function TaskTableViewComponent({
  columns,
  onViewTaskDetails,
  selectedTaskId,
  onCreateTask,
}: TaskTableViewProps) {
  const { t } = useTranslation(['tasks', 'common']);

  // Flatten all tasks from columns into a single sorted list
  const allTasks = useMemo(() => {
    const tasks: Array<{
      item: KanbanColumnItem;
      sharedTask?: SharedTaskRecord;
    }> = [];

    TASK_STATUSES.forEach((status) => {
      const items = columns[status] || [];
      items.forEach((item) => {
        if (item.type === 'task') {
          tasks.push({
            item,
            sharedTask: item.sharedTask,
          });
        }
        // Skip shared-only tasks in table view for now
        // They can be added later if needed
      });
    });

    // Sort by created_at descending (newest first)
    tasks.sort((a, b) => {
      const aDate = new Date(a.item.task.created_at).getTime();
      const bDate = new Date(b.item.task.created_at).getTime();
      return bDate - aDate;
    });

    return tasks;
  }, [columns]);

  // Get task IDs for bulk property fetch
  const taskIds = useMemo(
    () => allTasks.map(({ item }) => item.task.id),
    [allTasks]
  );

  // Fetch properties for all tasks
  const { data: taskProperties } = useTaskProperties(taskIds);

  const isEmpty = allTasks.length === 0;

  if (isEmpty) {
    return (
      <div className="max-w-7xl mx-auto mt-8 px-4">
        <Card>
          <CardContent className="text-center py-8">
            <p className="text-muted-foreground">{t('empty.noTasks')}</p>
            {onCreateTask && (
              <Button className="mt-4" onClick={onCreateTask}>
                <Plus className="h-4 w-4 mr-2" />
                {t('empty.createFirst')}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-auto px-4 sm:px-6 py-6">
      <div className="max-w-7xl mx-auto">
        <div className="rounded-2xl overflow-hidden bg-white dark:bg-slate-800/60 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.08)] dark:shadow-[0_4px_20px_-4px_rgba(0,0,0,0.4)]">
          <Table className="min-w-[700px]">
            <TableHead>
              <TableRow className="border-b border-border/30 bg-muted/30">
                <TableHeaderCell className="py-4 px-5 font-medium text-foreground/70 min-w-[200px]">
                  {t('table.title', { defaultValue: 'Title' })}
                </TableHeaderCell>
                <TableHeaderCell className="py-4 px-5 font-medium text-foreground/70 w-[120px]">
                  {t('table.status', { defaultValue: 'Status' })}
                </TableHeaderCell>
                <TableHeaderCell className="py-4 px-5 font-medium text-foreground/70 w-[100px] hidden sm:table-cell">
                  {t('table.priority', { defaultValue: 'Priority' })}
                </TableHeaderCell>
                <TableHeaderCell className="py-4 px-5 font-medium text-foreground/70 w-[100px] hidden lg:table-cell">
                  {t('table.genre', { defaultValue: 'Genre' })}
                </TableHeaderCell>
                <TableHeaderCell className="py-4 px-5 font-medium text-foreground/70 w-[100px] hidden md:table-cell">
                  {t('table.assignee', { defaultValue: 'Assignee' })}
                </TableHeaderCell>
                <TableHeaderCell className="py-4 px-5 font-medium text-foreground/70 w-[80px]">
                  {t('table.progress', { defaultValue: 'Progress' })}
                </TableHeaderCell>
                <TableHeaderCell className="py-4 px-5 font-medium w-[60px]">
                  <span className="sr-only">
                    {t('table.actions', { defaultValue: 'Actions' })}
                  </span>
                </TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {allTasks.map(({ item, sharedTask }) => {
                if (item.type !== 'task') return null;
                const props = taskProperties?.[item.task.id];
                return (
                  <TaskTableRow
                    key={item.task.id}
                    task={item.task}
                    sharedTask={sharedTask}
                    taskProps={props}
                    onViewDetails={onViewTaskDetails}
                    isSelected={selectedTaskId === item.task.id}
                  />
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

export const TaskTableView = memo(TaskTableViewComponent);
