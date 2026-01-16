import { LayoutGrid, Table2 } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useTaskView, type TaskViewMode } from '@/contexts/TaskViewContext';
import { cn } from '@/lib/utils';

interface ViewSwitcherProps {
  className?: string;
}

export function ViewSwitcher({ className }: ViewSwitcherProps) {
  const { viewMode, setViewMode } = useTaskView();

  return (
    <ToggleGroup
      type="single"
      value={viewMode}
      onValueChange={(value) => {
        if (value) {
          setViewMode(value as TaskViewMode);
        }
      }}
      className={cn('flex items-center gap-1 p-1 rounded-lg bg-muted/80', className)}
    >
      <ToggleGroupItem
        value="kanban"
        aria-label="Kanban view"
        active={viewMode === 'kanban'}
        className="flex flex-row items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium"
      >
        <LayoutGrid className="h-4 w-4 shrink-0" />
        <span className="hidden sm:inline whitespace-nowrap">カンバン</span>
      </ToggleGroupItem>
      <ToggleGroupItem
        value="table"
        aria-label="Table view"
        active={viewMode === 'table'}
        className="flex flex-row items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium"
      >
        <Table2 className="h-4 w-4 shrink-0" />
        <span className="hidden sm:inline whitespace-nowrap">テーブル</span>
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
