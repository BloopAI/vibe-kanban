import { useCallback, useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowUpDown,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { DataTable, type ColumnDef } from '@/components/ui/table/data-table';
import { useAllTasks, type TaskWithProject } from '@/hooks/useAllTasks';
import { useProjects } from '@/hooks/useProjects';
import { openTaskForm } from '@/lib/openTaskForm';
import { tasksApi } from '@/lib/api';
import { paths } from '@/lib/paths';
import type { TaskStatus } from 'shared/types';
import { statusLabels } from '@/utils/statusLabels';
import { ActionsDropdown } from '@/components/ui/actions-dropdown';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

type SortField = 'title' | 'status' | 'project' | 'created_at';
type SortDirection = 'asc' | 'desc';

interface SortState {
  field: SortField;
  direction: SortDirection;
}

const statusColors: Record<TaskStatus, string> = {
  todo: 'bg-neutral-500/10 text-neutral-500 border-neutral-500/20',
  inprogress: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  inreview: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  done: 'bg-green-500/10 text-green-500 border-green-500/20',
  cancelled: 'bg-red-500/10 text-red-500 border-red-500/20',
};

export function AllTasks() {
  const navigate = useNavigate();
  const { projects } = useProjects();

  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all');
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sort, setSort] = useState<SortState>({
    field: 'created_at',
    direction: 'desc',
  });

  const { tasks, isLoading, error, filteredTasks, refetch } = useAllTasks({
    status: statusFilter === 'all' ? undefined : statusFilter,
    searchQuery: searchQuery || undefined,
    projectId: projectFilter === 'all' ? undefined : projectFilter,
  });

  const sortedTasks = useMemo(() => {
    const result = [...filteredTasks];
    result.sort((a, b) => {
      let comparison = 0;

      switch (sort.field) {
        case 'title':
          comparison = a.title.localeCompare(b.title);
          break;
        case 'status':
          comparison = a.status.localeCompare(b.status);
          break;
        case 'project':
          comparison = a.project.name.localeCompare(b.project.name);
          break;
        case 'created_at':
          comparison =
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
      }

      return sort.direction === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [filteredTasks, sort]);

  const handleSort = (field: SortField) => {
    setSort((prev) => ({
      field,
      direction:
        prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const handleCreateTask = useCallback(() => {
    openTaskForm({ mode: 'create', onSuccess: refetch });
  }, [refetch]);

  const handleRowClick = useCallback(
    (task: TaskWithProject) => {
      navigate(`${paths.task(task.project_id, task.id)}/attempts/latest`);
    },
    [navigate]
  );

  const handleStatusChange = useCallback(
    async (task: TaskWithProject, newStatus: TaskStatus) => {
      try {
        await tasksApi.update(task.id, {
          title: task.title,
          description: task.description,
          status: newStatus,
          parent_workspace_id: task.parent_workspace_id,
          image_ids: null,
        });
      } catch (err) {
        console.error('Failed to update task status:', err);
      }
    },
    []
  );

  const columns: ColumnDef<TaskWithProject>[] = [
    {
      id: 'title',
      header: (
        <button
          onClick={() => handleSort('title')}
          className="flex items-center gap-2 hover:text-foreground/80"
        >
          Title
          <ArrowUpDown className="h-4 w-4" />
        </button>
      ),
      accessor: (row) => (
        <div className="max-w-md">
          <div className="font-medium">{row.title}</div>
          {row.description && (
            <div className="text-sm text-muted-foreground truncate">
              {row.description}
            </div>
          )}
        </div>
      ),
      className: 'py-3',
    },
    {
      id: 'status',
      header: (
        <button
          onClick={() => handleSort('status')}
          className="flex items-center gap-2 hover:text-foreground/80"
        >
          Status
          <ArrowUpDown className="h-4 w-4" />
        </button>
      ),
      accessor: (row) => (
        <Select
          value={row.status}
          onValueChange={(value) =>
            handleStatusChange(row, value as TaskStatus)
          }
        >
          <SelectTrigger className="h-8 w-fit">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(statusLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
    },
    {
      id: 'project',
      header: (
        <button
          onClick={() => handleSort('project')}
          className="flex items-center gap-2 hover:text-foreground/80"
        >
          Project
          <ArrowUpDown className="h-4 w-4" />
        </button>
      ),
      accessor: (row) => (
        <div
          className="flex items-center gap-2 cursor-pointer hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/projects/${row.project_id}/tasks`);
          }}
        >
          <div className="w-2 h-2 rounded-full bg-blue-500" />
          <span>{row.project.name}</span>
        </div>
      ),
    },
    {
      id: 'created_at',
      header: (
        <button
          onClick={() => handleSort('created_at')}
          className="flex items-center gap-2 hover:text-foreground/80"
        >
          Created
          <ArrowUpDown className="h-4 w-4" />
        </button>
      ),
      accessor: (row) => {
        const date = new Date(row.created_at);
        return (
          <div className="text-sm text-muted-foreground">
            {date.toLocaleString()}
          </div>
        );
      },
    },
    {
      id: 'actions',
      header: '',
      accessor: (row) => <ActionsDropdown task={row} />,
      className: 'text-right',
    },
  ];


  const stats = useMemo(() => {
    const byStatus: Record<TaskStatus, number> = {
      todo: 0,
      inprogress: 0,
      inreview: 0,
      done: 0,
      cancelled: 0,
    };
    tasks.forEach((task) => {
      byStatus[task.status]++;
    });
    return byStatus;
  }, [tasks]);

  if (error) {
    return (
      <div className="p-8">
        <Card>
          <CardContent className="py-8">
            <div className="text-center text-destructive">{error}</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b px-8 py-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/projects')}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">All Tasks</h1>
              <p className="text-sm text-muted-foreground">
                {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'} across{' '}
                {projects.length} {projects.length === 1 ? 'project' : 'projects'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={refetch} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
            <Button onClick={handleCreateTask}>
              <Plus className="mr-2 h-4 w-4" />
              New Task
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="flex gap-4 flex-wrap">
          {Object.entries(stats).map(([status, count]) => (
            <Badge
              key={status}
              variant="outline"
              className={`${statusColors[status as TaskStatus]} cursor-pointer`}
              onClick={() => setStatusFilter(status as TaskStatus)}
            >
              {statusLabels[status as TaskStatus]}: {count}
            </Badge>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="border-b px-8 py-4 flex gap-4 items-center flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tasks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
              onClick={() => setSearchQuery('')}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        <Select
          value={statusFilter}
          onValueChange={(value) => setStatusFilter(value as TaskStatus | 'all')}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {Object.entries(statusLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={projectFilter}
          onValueChange={setProjectFilter}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filter by project" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Projects</SelectItem>
            {projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(statusFilter !== 'all' || projectFilter !== 'all' || searchQuery) && (
          <Button
            variant="ghost"
            onClick={() => {
              setStatusFilter('all');
              setProjectFilter(projects[0]?.id ?? 'all');
              setSearchQuery('');
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading tasks...
          </div>
        ) : sortedTasks.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-muted mb-4">
                <Search className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No tasks found</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {searchQuery || statusFilter !== 'all' || projectFilter !== 'all'
                  ? 'Try adjusting your filters'
                  : 'Create your first task to get started'}
              </p>
              <Button onClick={handleCreateTask}>
                <Plus className="mr-2 h-4 w-4" />
                New Task
              </Button>
            </CardContent>
          </Card>
        ) : (
          <DataTable
            data={sortedTasks}
            columns={columns}
            keyExtractor={(row) => row.id}
            onRowClick={handleRowClick}
          />
        )}
      </div>
    </div>
  );
}
