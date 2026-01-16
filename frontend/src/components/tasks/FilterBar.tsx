import { X, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTaskFilters } from '@/contexts/TaskFiltersContext';
import { statusLabels } from '@/utils/statusLabels';
import { StatusBadge } from './StatusBadge';
import type { TaskStatus } from 'shared/types';
import { cn } from '@/lib/utils';

const ALL_STATUSES: TaskStatus[] = [
  'todo',
  'inprogress',
  'inreview',
  'done',
  'cancelled',
];

interface FilterBarProps {
  className?: string;
}

export function FilterBar({ className }: FilterBarProps) {
  const {
    statusFilter,
    toggleStatusFilter,
    clearStatusFilter,
    hasActiveFilters,
    clearAllFilters,
  } = useTaskFilters();

  return (
    <div className={cn('flex items-center gap-2 flex-wrap', className)}>
      {/* Status Filter Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              'h-8 gap-1',
              statusFilter.length > 0 && 'border-primary'
            )}
          >
            <Filter className="h-3.5 w-3.5" />
            Status
            {statusFilter.length > 0 && (
              <span className="ml-1 rounded-full bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">
                {statusFilter.length}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {ALL_STATUSES.map((status) => (
            <DropdownMenuCheckboxItem
              key={status}
              checked={statusFilter.includes(status)}
              onCheckedChange={() => toggleStatusFilter(status)}
            >
              <StatusBadge status={status} className="mr-2" />
              {statusLabels[status]}
            </DropdownMenuCheckboxItem>
          ))}
          {statusFilter.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={false}
                onCheckedChange={clearStatusFilter}
                className="text-muted-foreground"
              >
                Clear selection
              </DropdownMenuCheckboxItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Active filter badges */}
      {statusFilter.length > 0 && (
        <div className="flex items-center gap-1">
          {statusFilter.map((status) => (
            <button
              key={status}
              onClick={() => toggleStatusFilter(status)}
              className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs hover:bg-muted/80 transition-colors"
            >
              {statusLabels[status]}
              <X className="h-3 w-3" />
            </button>
          ))}
        </div>
      )}

      {/* Clear all filters */}
      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={clearAllFilters}
          className="h-8 px-2 text-muted-foreground hover:text-foreground"
        >
          Clear all
        </Button>
      )}
    </div>
  );
}
