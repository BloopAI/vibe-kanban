import { useState, useCallback, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Circle,
  SignalHigh,
  SignalMedium,
  SignalLow,
  AlertCircle,
  User,
  Users,
  CalendarDays,
  ChevronRight,
  FolderGit2,
  Check,
} from 'lucide-react';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { defineModal } from '@/lib/modals';
import { useTeams } from '@/hooks/useTeams';
import { useProjectMutations } from '@/hooks/useProjectMutations';
import { cn } from '@/lib/utils';
import { teamsApi } from '@/lib/api';
import type { CreateProject, ProjectStatus, Team, Project } from 'shared/types';
import { RepoPickerDialog } from '@/components/dialogs/shared/RepoPickerDialog';
import { useQueryClient } from '@tanstack/react-query';

export interface ProjectFormDialogProps {
  teamId?: string;
  editProject?: Project;
}

export type ProjectFormDialogResult = 'saved' | 'canceled';

// Priority options matching Linear's design
const PRIORITIES = [
  { value: 0, label: 'No priority', icon: Circle, shortcut: '0', color: 'text-muted-foreground' },
  { value: 1, label: 'Urgent', icon: AlertCircle, shortcut: '1', color: 'text-red-500' },
  { value: 2, label: 'High', icon: SignalHigh, shortcut: '2', color: 'text-orange-500' },
  { value: 3, label: 'Medium', icon: SignalMedium, shortcut: '3', color: 'text-yellow-500' },
  { value: 4, label: 'Low', icon: SignalLow, shortcut: '4', color: 'text-blue-500' },
];

// Status options with colors matching Linear
const PROJECT_STATUSES: { value: ProjectStatus; label: string; color: string }[] = [
  { value: 'backlog', label: 'Backlog', color: 'text-muted-foreground' },
  { value: 'planned', label: 'Planned', color: 'text-purple-500' },
  { value: 'inprogress', label: 'In Progress', color: 'text-yellow-500' },
  { value: 'paused', label: 'Paused', color: 'text-orange-500' },
  { value: 'completed', label: 'Completed', color: 'text-green-500' },
  { value: 'cancelled', label: 'Cancelled', color: 'text-red-500' },
];

// Common project icons
const PROJECT_ICONS = [
  '🚀', '📦', '🎯', '💡', '🔧', '📊', '🎨', '🔒',
  '⚡', '🌟', '📝', '🔍', '🏗️', '🎮', '📱', '🖥️',
];

// Quick date options for target date
type DateTab = 'day' | 'month' | 'quarter' | 'half' | 'year';

function getQuickDate(type: DateTab, value: number): Date {
  const now = new Date();
  const result = new Date(now);

  switch (type) {
    case 'day':
      result.setDate(now.getDate() + value);
      break;
    case 'month':
      result.setMonth(now.getMonth() + value);
      break;
    case 'quarter':
      result.setMonth(now.getMonth() + (value * 3));
      break;
    case 'half':
      result.setMonth(now.getMonth() + (value * 6));
      break;
    case 'year':
      result.setFullYear(now.getFullYear() + value);
      break;
  }
  return result;
}

function formatDate(date: Date | null): string {
  if (!date) return '';
  return date.toISOString().split('T')[0];
}

function parseDate(dateStr: string | null): Date | undefined {
  if (!dateStr) return undefined;
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? undefined : date;
}

const ProjectFormDialogImpl = NiceModal.create<ProjectFormDialogProps>(({ teamId, editProject }) => {
  const modal = useModal();
  const queryClient = useQueryClient();
  const { teams, teamsById } = useTeams();
  const isEditing = !!editProject;

  // Form state
  const [name, setName] = useState(editProject?.name || '');
  const [summary, setSummary] = useState(editProject?.summary || '');
  const [description, setDescription] = useState(editProject?.description || '');
  const [icon, setIcon] = useState(editProject?.icon || '📁');
  const [status, setStatus] = useState<ProjectStatus>((editProject?.status as ProjectStatus) || 'backlog');
  const [priority, setPriority] = useState<number>(editProject?.priority || 0);
  const [leadId, setLeadId] = useState<string | null>(editProject?.lead_id || null);
  const [startDate, setStartDate] = useState<Date | undefined>(parseDate(editProject?.start_date || null));
  const [targetDate, setTargetDate] = useState<Date | undefined>(parseDate(editProject?.target_date || null));
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(teamId || null);
  const [repoPath, setRepoPath] = useState<string | null>(null);
  const [repoDisplayName, setRepoDisplayName] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [targetDateTab, setTargetDateTab] = useState<DateTab>('month');
  const [iconPopoverOpen, setIconPopoverOpen] = useState(false);
  const [startDateOpen, setStartDateOpen] = useState(false);
  const [targetDateOpen, setTargetDateOpen] = useState(false);

  const { createProject, updateProject } = useProjectMutations({
    onCreateSuccess: async (project: Project) => {
      // If this is a team project, assign it to the team
      if (teamId) {
        try {
          await teamsApi.assignProject(teamId, { project_id: project.id });
          // Invalidate team projects cache so the list updates
          queryClient.invalidateQueries({ queryKey: ['teams', teamId, 'projects'] });
        } catch (err) {
          console.error('Failed to assign project to team:', err);
        }
      }
      modal.resolve('saved' as ProjectFormDialogResult);
      modal.hide();
    },
    onCreateError: () => {
      setIsSubmitting(false);
    },
    onUpdateSuccess: () => {
      modal.resolve('saved' as ProjectFormDialogResult);
      modal.hide();
    },
    onUpdateError: () => {
      setIsSubmitting(false);
    },
  });

  const selectedPriority = PRIORITIES.find((p) => p.value === priority) || PRIORITIES[0];
  const selectedStatus = PROJECT_STATUSES.find((s) => s.value === status) || PROJECT_STATUSES[0];
  const selectedTeam = selectedTeamId ? teamsById[selectedTeamId] : null;

  // Handle adding a repository
  const handleAddRepo = async () => {
    try {
      const repo = await RepoPickerDialog.show({
        title: 'Add Repository',
        description: 'Select or create a repository for your project',
      });

      if (repo) {
        setRepoPath(repo.path);
        setRepoDisplayName(repo.display_name || repo.name);
      }
    } catch {
      // User cancelled
    }
  };

  // Team projects (when teamId is set) don't require a repository
  // Workspace projects (via "Your projects") require a repository
  const isTeamProject = !!teamId;

  const handleSubmit = useCallback(async () => {
    if (!name.trim()) return;
    // Only require repository for non-team projects
    if (!isEditing && !isTeamProject && !repoPath) return;

    try {
      setIsSubmitting(true);

      if (isEditing && editProject) {
        await updateProject.mutateAsync({
          projectId: editProject.id,
          data: {
            name: name.trim(),
            dev_script: null,
            dev_script_working_dir: null,
            default_agent_working_dir: null,
            priority: priority || null,
            lead_id: leadId,
            start_date: startDate ? formatDate(startDate) : null,
            target_date: targetDate ? formatDate(targetDate) : null,
            status: status,
            health: null,
            description: description.trim() || null,
            summary: summary.trim() || null,
            icon: icon,
          },
        });
      } else {
        const createData: CreateProject = {
          name: name.trim(),
          // Team projects have no repositories, workspace projects require one
          repositories: isTeamProject ? [] : [{ display_name: repoDisplayName || name.trim(), git_repo_path: repoPath! }],
          priority: priority || null,
          lead_id: leadId,
          start_date: startDate ? formatDate(startDate) : null,
          target_date: targetDate ? formatDate(targetDate) : null,
          status: status,
          description: description.trim() || null,
          summary: summary.trim() || null,
          icon: icon,
        };

        await createProject.mutateAsync(createData);
        // Team assignment happens in onCreateSuccess callback
      }
    } catch (err) {
      console.error('Failed to save project:', err);
    } finally {
      setIsSubmitting(false);
    }
  }, [name, summary, description, icon, status, priority, leadId, startDate, targetDate, repoPath, repoDisplayName, isEditing, editProject, createProject, updateProject, isTeamProject, teamId]);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      modal.resolve('canceled' as ProjectFormDialogResult);
      modal.hide();
    }
  };

  const PriorityIcon = selectedPriority.icon;
  // Only name is required - repository is optional for new projects
  const canSubmit = !!name.trim();

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInTextarea = target.tagName === 'TEXTAREA';

      // Priority shortcuts (0-4) when not in textarea
      if (!isInTextarea && !e.metaKey && !e.ctrlKey) {
        if (e.key >= '0' && e.key <= '4') {
          e.preventDefault();
          setPriority(parseInt(e.key, 10));
        }
      }

      // Cmd/Ctrl+Enter to submit
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (canSubmit) {
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
  }, [modal.visible, canSubmit, handleSubmit]);

  return (
    <Dialog open={modal.visible} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[600px] p-0 gap-0">
        {/* Header with team badge and icon selector */}
        <div className="flex items-center gap-2 px-4 py-3 border-b text-sm text-muted-foreground">
          {/* Icon selector */}
          <Popover open={iconPopoverOpen} onOpenChange={setIconPopoverOpen}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-lg">
                {icon}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2" align="start">
              <div className="grid grid-cols-8 gap-1">
                {PROJECT_ICONS.map((emoji) => (
                  <Button
                    key={emoji}
                    variant="ghost"
                    size="sm"
                    className={cn('h-8 w-8 p-0 text-lg', icon === emoji && 'bg-accent')}
                    onClick={() => {
                      setIcon(emoji);
                      setIconPopoverOpen(false);
                    }}
                  >
                    {emoji}
                  </Button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {/* Team badge */}
          {selectedTeam ? (
            <>
              <span className="font-medium text-foreground">
                {selectedTeam.icon || '👥'} {selectedTeam.name}
              </span>
              <ChevronRight className="h-4 w-4" />
            </>
          ) : teams.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs">
                  <Users className="h-3.5 w-3.5" />
                  Select team
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                {teams.map((t: Team) => (
                  <DropdownMenuItem
                    key={t.id}
                    onClick={() => setSelectedTeamId(t.id)}
                  >
                    {t.icon || '👥'} {t.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}

          <span>{isEditing ? 'Edit project' : 'New project'}</span>
        </div>

        {/* Main form */}
        <div className="p-4 space-y-3">
          {/* Project name */}
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Project name"
            className="text-lg font-medium border-0 shadow-none px-0 focus-visible:ring-0 placeholder:text-muted-foreground/50"
            autoFocus
            disabled={isSubmitting}
          />

          {/* Short summary */}
          <Input
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Add a short summary..."
            className="text-sm border-0 shadow-none px-0 focus-visible:ring-0 placeholder:text-muted-foreground/50"
            disabled={isSubmitting}
          />

          {/* Description */}
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add description..."
            className="min-h-[80px] border-0 shadow-none px-0 resize-none focus-visible:ring-0 placeholder:text-muted-foreground/50"
            disabled={isSubmitting}
          />
        </div>

        {/* Bottom toolbar */}
        <div className="flex flex-wrap items-center gap-1 px-3 py-2 border-t bg-muted/30">
          {/* Status */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs">
                <div className={cn('h-3 w-3 rounded-full border-2', selectedStatus.color.replace('text-', 'border-'))} />
                {selectedStatus.label}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-40">
              {PROJECT_STATUSES.map((s) => (
                <DropdownMenuItem
                  key={s.value}
                  onClick={() => setStatus(s.value)}
                  className={cn('gap-2', status === s.value && 'bg-accent')}
                >
                  <div className={cn('h-3 w-3 rounded-full border-2', s.color.replace('text-', 'border-'))} />
                  {s.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Priority */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs">
                <PriorityIcon className={cn('h-3.5 w-3.5', selectedPriority.color)} />
                {selectedPriority.label !== 'No priority' && selectedPriority.label}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              {PRIORITIES.map((p) => {
                const Icon = p.icon;
                return (
                  <DropdownMenuItem
                    key={p.value}
                    onClick={() => setPriority(p.value)}
                    className={cn('justify-between', priority === p.value && 'bg-accent')}
                  >
                    <span className="flex items-center gap-2">
                      <Icon className={cn('h-4 w-4', p.color)} />
                      {p.label}
                    </span>
                    <span className="text-xs text-muted-foreground">{p.shortcut}</span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Lead */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs">
                <User className="h-3.5 w-3.5" />
                {leadId ? 'Lead assigned' : 'Lead'}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuItem onClick={() => setLeadId(null)}>
                No lead
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                Team members coming soon
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Members */}
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs" disabled>
            <Users className="h-3.5 w-3.5" />
          </Button>

          {/* Repository - only for new workspace projects (not team projects) */}
          {!isEditing && !isTeamProject && (
            <Button
              variant="ghost"
              size="sm"
              className={cn('h-7 gap-1.5 px-2 text-xs', repoPath && 'text-foreground')}
              onClick={handleAddRepo}
            >
              {repoPath ? (
                <>
                  <Check className="h-3.5 w-3.5 text-green-500" />
                  <span className="max-w-[100px] truncate">{repoDisplayName || 'Repository'}</span>
                </>
              ) : (
                <>
                  <FolderGit2 className="h-3.5 w-3.5" />
                  Repository
                </>
              )}
            </Button>
          )}

          {/* Start date */}
          <Popover open={startDateOpen} onOpenChange={setStartDateOpen}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className={cn('h-7 gap-1.5 px-2 text-xs', startDate && 'text-foreground')}>
                <CalendarDays className="h-3.5 w-3.5" />
                {startDate ? (
                  <span>{startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                ) : (
                  'Start'
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={startDate}
                onSelect={(date: Date | undefined) => {
                  setStartDate(date);
                  setStartDateOpen(false);
                }}
                initialFocus
              />
              {startDate && (
                <div className="border-t p-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs"
                    onClick={() => {
                      setStartDate(undefined);
                      setStartDateOpen(false);
                    }}
                  >
                    Clear start date
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>

          {/* Target date */}
          <Popover open={targetDateOpen} onOpenChange={setTargetDateOpen}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className={cn('h-7 gap-1.5 px-2 text-xs', targetDate && 'text-foreground')}>
                <CalendarDays className="h-3.5 w-3.5" />
                {targetDate ? (
                  <span>{targetDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                ) : (
                  'Target'
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Tabs value={targetDateTab} onValueChange={(v: string) => setTargetDateTab(v as DateTab)} className="w-full">
                <TabsList className="grid w-full grid-cols-5 h-8">
                  <TabsTrigger value="day" className="text-xs">Day</TabsTrigger>
                  <TabsTrigger value="month" className="text-xs">Month</TabsTrigger>
                  <TabsTrigger value="quarter" className="text-xs">Quarter</TabsTrigger>
                  <TabsTrigger value="half" className="text-xs">Half</TabsTrigger>
                  <TabsTrigger value="year" className="text-xs">Year</TabsTrigger>
                </TabsList>
                <TabsContent value="day" className="p-2 space-y-1">
                  {[1, 3, 7, 14, 30].map((days) => (
                    <Button
                      key={days}
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start text-xs"
                      onClick={() => {
                        setTargetDate(getQuickDate('day', days));
                        setTargetDateOpen(false);
                      }}
                    >
                      In {days} day{days > 1 ? 's' : ''}
                    </Button>
                  ))}
                </TabsContent>
                <TabsContent value="month" className="p-2 space-y-1">
                  {[1, 2, 3, 6].map((months) => (
                    <Button
                      key={months}
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start text-xs"
                      onClick={() => {
                        setTargetDate(getQuickDate('month', months));
                        setTargetDateOpen(false);
                      }}
                    >
                      In {months} month{months > 1 ? 's' : ''}
                    </Button>
                  ))}
                </TabsContent>
                <TabsContent value="quarter" className="p-2 space-y-1">
                  {[1, 2, 3, 4].map((quarters) => (
                    <Button
                      key={quarters}
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start text-xs"
                      onClick={() => {
                        setTargetDate(getQuickDate('quarter', quarters));
                        setTargetDateOpen(false);
                      }}
                    >
                      In {quarters} quarter{quarters > 1 ? 's' : ''}
                    </Button>
                  ))}
                </TabsContent>
                <TabsContent value="half" className="p-2 space-y-1">
                  {[1, 2].map((halves) => (
                    <Button
                      key={halves}
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start text-xs"
                      onClick={() => {
                        setTargetDate(getQuickDate('half', halves));
                        setTargetDateOpen(false);
                      }}
                    >
                      In {halves} half-year{halves > 1 ? 's' : ''}
                    </Button>
                  ))}
                </TabsContent>
                <TabsContent value="year" className="p-2 space-y-1">
                  {[1, 2, 3].map((years) => (
                    <Button
                      key={years}
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start text-xs"
                      onClick={() => {
                        setTargetDate(getQuickDate('year', years));
                        setTargetDateOpen(false);
                      }}
                    >
                      In {years} year{years > 1 ? 's' : ''}
                    </Button>
                  ))}
                </TabsContent>
              </Tabs>
              <div className="border-t">
                <Calendar
                  mode="single"
                  selected={targetDate}
                  onSelect={(date: Date | undefined) => {
                    setTargetDate(date);
                    setTargetDateOpen(false);
                  }}
                />
              </div>
              {targetDate && (
                <div className="border-t p-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs"
                    onClick={() => {
                      setTargetDate(undefined);
                      setTargetDateOpen(false);
                    }}
                  >
                    Clear target date
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Create/Save button */}
          <Button
            size="sm"
            className="h-7 px-3 text-xs gap-1"
            onClick={handleSubmit}
            disabled={isSubmitting || !canSubmit}
          >
            {isSubmitting ? (isEditing ? 'Saving...' : 'Creating...') : (isEditing ? 'Save changes' : 'Create project')}
            <kbd className="hidden sm:inline-flex h-4 items-center gap-0.5 rounded bg-primary-foreground/20 px-1 text-[10px] font-medium">
              <span className="text-[10px]">⌘</span>↵
            </kbd>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
});

export const ProjectFormDialog = defineModal<
  ProjectFormDialogProps,
  ProjectFormDialogResult
>(ProjectFormDialogImpl);
