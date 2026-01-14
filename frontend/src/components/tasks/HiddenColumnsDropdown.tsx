import { EyeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { TaskStatus } from 'shared/types';
import { statusLabels, statusBoardColors } from '@/utils/statusLabels';
import type { KanbanColumns } from './TaskKanbanBoard';

const TASK_STATUSES: TaskStatus[] = [
  'todo',
  'inprogress',
  'inreview',
  'done',
  'cancelled',
];

interface HiddenColumnsDropdownProps {
  hiddenColumns: TaskStatus[];
  onToggleColumn: (column: TaskStatus) => void;
  columns: KanbanColumns;
}

export function HiddenColumnsDropdown({
  hiddenColumns,
  onToggleColumn,
  columns,
}: HiddenColumnsDropdownProps) {
  const { t } = useTranslation('tasks');

  const hiddenCount = hiddenColumns.length;

  if (hiddenCount === 0) {
    return null;
  }

  return (
    <DropdownMenu>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground hover:text-foreground"
              >
                <EyeOff className="h-4 w-4" />
                <span className="text-sm">
                  {t('kanban.hiddenColumns', { count: hiddenCount })}
                </span>
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {t('kanban.hiddenColumnsTooltip')}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{t('kanban.hiddenColumnsLabel')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {TASK_STATUSES.map((status) => {
          const isHidden = hiddenColumns.includes(status);
          const count = columns[status]?.length ?? 0;
          return (
            <DropdownMenuCheckboxItem
              key={status}
              checked={!isHidden}
              onCheckedChange={() => onToggleColumn(status)}
              className="gap-2"
            >
              <div className="flex items-center gap-2 flex-1">
                <div
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{
                    backgroundColor: `hsl(var(${statusBoardColors[status]}))`,
                  }}
                />
                <span>{statusLabels[status]}</span>
                <span className="ml-auto text-muted-foreground">{count}</span>
              </div>
            </DropdownMenuCheckboxItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
