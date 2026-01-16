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
      className={cn('flex items-center gap-1 p-1 rounded bg-muted', className)}
    >
      <ToggleGroupItem
        value="kanban"
        aria-label="Kanban view"
        active={viewMode === 'kanban'}
        className="p-1.5"
      >
        <LayoutGrid className="h-4 w-4" />
      </ToggleGroupItem>
      <ToggleGroupItem
        value="table"
        aria-label="Table view"
        active={viewMode === 'table'}
        className="p-1.5"
      >
        <Table2 className="h-4 w-4" />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
