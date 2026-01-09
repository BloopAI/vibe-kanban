import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { ListFilter, X, AlertCircle, ArrowUp, ArrowRight, ArrowDown, Minus, User, FolderKanban } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TaskWithAttemptStatus } from 'shared/types';

export interface FilterState {
  priority: number[] | null;
  assigneeId: string[] | null;
  projectId: string | null;
}

interface TeamMember {
  id: string;
  name: string;
  email?: string;
}

interface Project {
  id: string;
  name: string;
}

interface IssueFilterDropdownProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  teamMembers: TeamMember[];
  projects: Project[];
  issues?: TaskWithAttemptStatus[];
}

const PRIORITY_OPTIONS = [
  { value: 1, label: 'Urgent', icon: AlertCircle, className: 'text-red-500' },
  { value: 2, label: 'High', icon: ArrowUp, className: 'text-orange-500' },
  { value: 3, label: 'Medium', icon: ArrowRight, className: 'text-yellow-500' },
  { value: 4, label: 'Low', icon: ArrowDown, className: 'text-blue-500' },
  { value: 0, label: 'None', icon: Minus, className: 'text-muted-foreground' },
];

export function IssueFilterDropdown({
  filters,
  onFiltersChange,
  teamMembers,
  projects,
  issues = [],
}: IssueFilterDropdownProps) {
  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.priority?.length) count += filters.priority.length;
    if (filters.assigneeId?.length) count += filters.assigneeId.length;
    if (filters.projectId) count += 1;
    return count;
  }, [filters]);

  // Count issues per assignee
  const assigneeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    issues.forEach(issue => {
      if (issue.assignee_id) {
        counts[issue.assignee_id] = (counts[issue.assignee_id] || 0) + 1;
      }
    });
    return counts;
  }, [issues]);

  const handlePriorityToggle = (priority: number) => {
    const current = filters.priority || [];
    const newPriorities = current.includes(priority)
      ? current.filter((p) => p !== priority)
      : [...current, priority];

    onFiltersChange({
      ...filters,
      priority: newPriorities.length > 0 ? newPriorities : null,
    });
  };

  const handleAssigneeToggle = (assigneeId: string) => {
    const current = filters.assigneeId || [];
    const newAssignees = current.includes(assigneeId)
      ? current.filter((a) => a !== assigneeId)
      : [...current, assigneeId];

    onFiltersChange({
      ...filters,
      assigneeId: newAssignees.length > 0 ? newAssignees : null,
    });
  };

  const handleProjectToggle = (projectId: string) => {
    onFiltersChange({
      ...filters,
      projectId: filters.projectId === projectId ? null : projectId,
    });
  };

  const handleClearAll = () => {
    onFiltersChange({
      priority: null,
      assigneeId: null,
      projectId: null,
    });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'text-muted-foreground hover:text-foreground gap-1.5',
            activeFilterCount > 0 && 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950'
          )}
        >
          <ListFilter className="h-4 w-4" />
          Filter
          {activeFilterCount > 0 && (
            <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-medium text-white">
              {activeFilterCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 bg-background border-border text-foreground p-0"
      >
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-medium">Filters</span>
          {activeFilterCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearAll}
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3 mr-1" />
              Clear all
            </Button>
          )}
        </div>

        <div className="max-h-[400px] overflow-y-auto">
          {/* Priority Section */}
          <div className="border-b p-3">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Priority</span>
            </div>
            <div className="space-y-1">
              {PRIORITY_OPTIONS.map((option) => {
                const Icon = option.icon;
                const isChecked = filters.priority?.includes(option.value) || false;
                return (
                  <label
                    key={option.value}
                    className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/50 cursor-pointer"
                  >
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={() => handlePriorityToggle(option.value)}
                      className="border-muted-foreground"
                    />
                    <Icon className={cn('h-4 w-4', option.className)} />
                    <span className="text-sm">{option.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Assignee Section */}
          {teamMembers.length > 0 && (
            <div className="border-b p-3">
              <div className="flex items-center gap-2 mb-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Assignee</span>
              </div>
              <div className="space-y-1">
                {teamMembers.map((member) => {
                  const isChecked = filters.assigneeId?.includes(member.id) || false;
                  const issueCount = assigneeCounts[member.id] || 0;
                  return (
                    <label
                      key={member.id}
                      className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/50 cursor-pointer"
                    >
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={() => handleAssigneeToggle(member.id)}
                        className="border-muted-foreground"
                      />
                      <span className="text-sm flex-1">{member.name}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {issueCount}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Project Section */}
          {projects.length > 0 && (
            <div className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <FolderKanban className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Project</span>
              </div>
              <div className="space-y-1">
                {projects.map((project) => {
                  const isChecked = filters.projectId === project.id;
                  return (
                    <label
                      key={project.id}
                      className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/50 cursor-pointer"
                    >
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={() => handleProjectToggle(project.id)}
                        className="border-muted-foreground"
                      />
                      <span className="text-sm">{project.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
