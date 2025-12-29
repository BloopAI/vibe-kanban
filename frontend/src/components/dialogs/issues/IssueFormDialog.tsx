import { useState, useCallback, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Folder,
  Tag,
  MoreHorizontal,
  CalendarDays,
  ChevronRight,
  Link,
} from 'lucide-react';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { defineModal } from '@/lib/modals';
import { useTeams } from '@/hooks/useTeams';
import { useProjects } from '@/hooks/useProjects';
import { useTaskMutations } from '@/hooks/useTaskMutations';
import { cn } from '@/lib/utils';
import type { TaskStatus } from 'shared/types';
import { PrioritySelector, type PriorityValue } from '@/components/selectors/PrioritySelector';
import { AssigneeSelector, type TeamMember } from '@/components/selectors/AssigneeSelector';

export interface IssueFormDialogProps {
  teamId?: string;
  projectId?: string;
}

export type IssueFormDialogResult = 'created' | 'canceled';

// Status options with colors matching Linear
const STATUSES: { value: TaskStatus; label: string; color: string; bgColor: string }[] = [
  { value: 'todo', label: 'Backlog', color: 'text-muted-foreground', bgColor: 'bg-muted-foreground' },
  { value: 'inprogress', label: 'In Progress', color: 'text-yellow-500', bgColor: 'bg-yellow-500' },
  { value: 'inreview', label: 'In Review', color: 'text-blue-500', bgColor: 'bg-blue-500' },
  { value: 'done', label: 'Done', color: 'text-green-500', bgColor: 'bg-green-500' },
  { value: 'cancelled', label: 'Cancelled', color: 'text-red-500', bgColor: 'bg-red-500' },
];

// Mock team members - in real app, fetch from API
const MOCK_TEAM_MEMBERS: TeamMember[] = [
  { id: '1', name: 'John Doe', email: 'john@example.com' },
  { id: '2', name: 'Jane Smith', email: 'jane@example.com' },
  { id: '3', name: 'Bob Johnson', email: 'bob@example.com' },
];

// Due date presets
const DUE_DATE_PRESETS = [
  { label: 'Tomorrow', days: 1 },
  { label: 'End of this week', days: 'end_of_week' as const },
  { label: 'In one week', days: 7 },
];

function getDueDate(preset: typeof DUE_DATE_PRESETS[number]): string {
  const now = new Date();
  if (preset.days === 'end_of_week') {
    // Get end of week (Sunday)
    const day = now.getDay();
    const diff = 7 - day;
    const endOfWeek = new Date(now);
    endOfWeek.setDate(now.getDate() + diff);
    return endOfWeek.toISOString().split('T')[0];
  }
  const date = new Date(now);
  date.setDate(now.getDate() + preset.days);
  return date.toISOString().split('T')[0];
}

const IssueFormDialogImpl = NiceModal.create<IssueFormDialogProps>(({ teamId, projectId: initialProjectId }) => {
  const modal = useModal();
  const { teamsById } = useTeams();
  const { projects } = useProjects();
  const team = teamId ? teamsById[teamId] : null;

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>('todo');
  const [priority, setPriority] = useState<number>(0);
  const [projectId, setProjectId] = useState<string | null>(initialProjectId || null);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [createMore, setCreateMore] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { createTask } = useTaskMutations(projectId || undefined);

  const selectedStatus = STATUSES.find((s) => s.value === status) || STATUSES[0];
  const selectedProject = projectId ? projects.find((p) => p.id === projectId) : null;

  const handleSubmit = useCallback(async () => {
    if (!title.trim()) return;
    if (!projectId) {
      // Need at least a project
      return;
    }

    try {
      setIsSubmitting(true);
      await createTask.mutateAsync({
        project_id: projectId,
        title: title.trim(),
        description: description.trim() || null,
        status: status,
        parent_workspace_id: null,
        image_ids: null,
        shared_task_id: null,
        team_id: teamId || null,
        priority: priority || null,
        due_date: dueDate,
        assignee_id: assigneeId,
      });

      if (createMore) {
        // Reset form for next issue
        setTitle('');
        setDescription('');
        setPriority(0);
        setDueDate(null);
        setAssigneeId(null);
      } else {
        modal.resolve('created' as IssueFormDialogResult);
        modal.hide();
      }
    } catch (err) {
      console.error('Failed to create issue:', err);
    } finally {
      setIsSubmitting(false);
    }
  }, [title, description, status, priority, projectId, teamId, dueDate, assigneeId, createMore, createTask, modal]);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      modal.resolve('canceled' as IssueFormDialogResult);
      modal.hide();
    }
  };

  // Keyboard shortcuts: 0-4 for priority, Cmd/Ctrl+Enter to submit
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Priority shortcuts (only when not in textarea or input is title)
      const target = e.target as HTMLElement;
      const isInTextarea = target.tagName === 'TEXTAREA';

      if (!isInTextarea && !e.metaKey && !e.ctrlKey) {
        if (e.key >= '0' && e.key <= '4') {
          e.preventDefault();
          setPriority(parseInt(e.key, 10));
        }
      }

      // Cmd/Ctrl+Enter to submit
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (title.trim() && projectId) {
          handleSubmit();
        }
      }
    };

    if (modal.visible) {
      window.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [modal.visible, title, projectId, handleSubmit]);

  return (
    <Dialog open={modal.visible} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[540px] p-0 gap-0">
        {/* Header with team badge */}
        <div className="flex items-center gap-1 px-4 py-3 border-b text-sm text-muted-foreground">
          {team ? (
            <>
              <span className="font-medium text-foreground">
                {team.icon || '👥'} {team.name}
              </span>
              <ChevronRight className="h-4 w-4" />
            </>
          ) : null}
          <span>New issue</span>
        </div>

        {/* Main form */}
        <div className="p-4 space-y-3">
          {/* Title */}
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Issue title"
            className="text-lg font-medium border-0 shadow-none px-0 focus-visible:ring-0 placeholder:text-muted-foreground/50"
            autoFocus
            disabled={isSubmitting}
          />

          {/* Description */}
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add description..."
            className="min-h-[100px] border-0 shadow-none px-0 resize-none focus-visible:ring-0 placeholder:text-muted-foreground/50"
            disabled={isSubmitting}
          />
        </div>

        {/* Bottom toolbar */}
        <div className="px-4 py-3 border-t bg-muted/20">
          {/* Toolbar buttons row */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {/* Status */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "h-8 gap-2 px-3 text-xs font-medium rounded-md",
                    "border-border/60 hover:bg-accent/50"
                  )}
                >
                  <div className={cn('h-2.5 w-2.5 rounded-full', selectedStatus.bgColor)} />
                  {selectedStatus.label}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44">
                {STATUSES.map((s) => (
                  <DropdownMenuItem
                    key={s.value}
                    onClick={() => setStatus(s.value)}
                    className={cn('gap-2 cursor-pointer', status === s.value && 'bg-accent')}
                  >
                    <div className={cn('h-2.5 w-2.5 rounded-full', s.bgColor)} />
                    {s.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Priority */}
            <PrioritySelector
              value={priority as PriorityValue}
              onChange={(value) => setPriority(value)}
              disabled={isSubmitting}
            />

            {/* Assignee */}
            <AssigneeSelector
              value={assigneeId}
              onChange={setAssigneeId}
              teamMembers={MOCK_TEAM_MEMBERS}
              disabled={isSubmitting}
            />

            {/* Project */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "h-8 gap-2 px-3 text-xs font-medium rounded-md",
                    "border-border/60 hover:bg-accent/50",
                    selectedProject && "text-indigo-600 dark:text-indigo-400"
                  )}
                >
                  <Folder className="h-3.5 w-3.5" />
                  {selectedProject?.name || 'Project'}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuItem onClick={() => setProjectId(null)} className="cursor-pointer">
                  No project
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {projects.map((p) => (
                  <DropdownMenuItem
                    key={p.id}
                    onClick={() => setProjectId(p.id)}
                    className={cn('cursor-pointer', projectId === p.id && 'bg-accent')}
                  >
                    {p.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* More menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <CalendarDays className="h-4 w-4 mr-2" />
                    Set due date
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-48">
                    {DUE_DATE_PRESETS.map((preset) => (
                      <DropdownMenuItem
                        key={preset.label}
                        onClick={() => setDueDate(getDueDate(preset))}
                        className="cursor-pointer"
                      >
                        {preset.label}
                      </DropdownMenuItem>
                    ))}
                    {dueDate && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setDueDate(null)} className="cursor-pointer text-red-500">
                          Clear due date
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuItem disabled>
                  <Tag className="h-4 w-4 mr-2" />
                  Add labels
                </DropdownMenuItem>
                <DropdownMenuItem disabled>
                  <Link className="h-4 w-4 mr-2" />
                  Add link
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Due date indicator */}
            {dueDate && (
              <span className="text-xs text-blue-600 dark:text-blue-400 font-medium px-2 py-1 bg-blue-50 dark:bg-blue-950/30 rounded-md">
                Due {new Date(dueDate).toLocaleDateString()}
              </span>
            )}
          </div>

          {/* Action row */}
          <div className="flex items-center justify-between pt-2 border-t border-border/40">
            {/* Create more toggle */}
            <div className="flex items-center gap-2">
              <Switch
                id="create-more"
                checked={createMore}
                onCheckedChange={setCreateMore}
                className="h-4 w-8 data-[state=checked]:bg-indigo-500"
              />
              <Label htmlFor="create-more" className="text-xs text-muted-foreground cursor-pointer select-none">
                Create more
              </Label>
            </div>

            {/* Create button */}
            <Button
              size="sm"
              className={cn(
                "h-8 px-4 text-xs font-medium gap-1.5",
                "bg-indigo-600 hover:bg-indigo-700 text-white",
                "shadow-sm"
              )}
              onClick={handleSubmit}
              disabled={isSubmitting || !title.trim() || !projectId}
            >
              {isSubmitting ? 'Creating...' : 'Create issue'}
              <kbd className="hidden sm:inline-flex h-5 items-center gap-0.5 rounded bg-indigo-500/50 px-1.5 text-[10px] font-medium">
                <span>⌘</span>↵
              </kbd>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
});

export const IssueFormDialog = defineModal<
  IssueFormDialogProps,
  IssueFormDialogResult
>(IssueFormDialogImpl);
