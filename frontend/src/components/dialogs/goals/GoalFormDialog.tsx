import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { useTaskMutations } from '@/hooks/useTaskMutations';
import { useProjectRepos, useRepoBranchSelection } from '@/hooks';
import { useUserSystem } from '@/components/ConfigProvider';
import { defineModal } from '@/lib/modals';
import { Bot, User, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Task } from 'shared/types';

export type GoalFormDialogProps = {
  projectId: string;
};

export type GoalFormDialogResult = {
  action: 'created' | 'canceled';
  task?: Task;
};

type ExecutionMode = 'regular' | 'auto_managed';

const GOAL_PREFIX = '[Goal] ';

const buildGoalDescription = (
  userDescription: string,
  autoManaged: boolean
): string => {
  // The prompt structure is critical. Claude reads top-to-bottom and forms
  // its understanding of the task from the first things it sees.
  //
  // Key principles:
  // 1. Role definition FIRST - before any content that looks like work
  // 2. Establish what SUCCESS looks like (tasks created, not code written)
  // 3. Explicit "what not to do" with reasoning Claude can internalize
  // 4. The user's goal comes LAST, after the framing is established
  // 5. Use language patterns Claude responds to ("your role", "you are", "success means")

  const executionMode = autoManaged
    ? `For each task you create, IMMEDIATELY call \`start_workspace_session\` to hand it off to an implementation agent.`
    : `Create all tasks but do NOT start them. Leave them in "todo" status for user review.`;

  return `You are a **Project Planner Agent**.

Your role is to decompose a goal into actionable tasks. You are NOT an implementation agent. You do not write code, edit files, or make changes to the codebase. Your only tools are the MCP task management tools.

## What Success Looks Like

When you complete this task successfully, the board will have 3-7 new child tasks under this goal. Each task will have:
- A clear, actionable title starting with a verb (Implement, Add, Create, Update, Fix, Test)
- A description with enough context for an implementation agent to execute it
- The \`parent_workspace_id\` set to this task's workspace ID

You will NOT have:
- Written any code
- Created or modified any files
- Made any git commits
- Used any tools besides \`list_tasks\`, \`create_task\`${autoManaged ? ', and `start_workspace_session`' : ''}

## Your Process

1. **Understand the goal** - Read the objective below carefully
2. **Identify the work** - What discrete pieces of work need to happen?
3. **Create tasks** - Use \`create_task\` for each piece of work
4. ${autoManaged ? '**Start tasks** - Call `start_workspace_session` for each task you create' : '**Stop** - Once tasks are created, you are done'}

${executionMode}

## Task Creation Guidelines

Each task should be:
- **Atomic**: One clear objective that can be completed in a single session
- **Specific**: Include file paths, function names, or specific requirements when known
- **Independent**: Minimize dependencies between tasks where possible
- **Testable**: The implementer should know when they're done

Bad task: "Work on authentication"
Good task: "Implement login API endpoint at POST /api/auth/login that accepts email/password and returns a JWT token"

---

## The Goal

${userDescription.trim() || '(No description provided - analyze the codebase to understand what needs to be done)'}

---

Now decompose this goal into tasks. Remember: create tasks, do not implement them.`;
};

const GoalFormDialogImpl = NiceModal.create<GoalFormDialogProps>(
  ({ projectId }) => {
    const modal = useModal();
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [executionMode, setExecutionMode] =
      useState<ExecutionMode>('regular');
    const [error, setError] = useState<string | null>(null);

    const { createAndStart } = useTaskMutations(projectId);
    const { system } = useUserSystem();
    const { data: projectRepos = [] } = useProjectRepos(projectId, {
      enabled: modal.visible,
    });
    const { configs: repoBranchConfigs } = useRepoBranchSelection({
      repos: projectRepos,
      enabled: modal.visible && projectRepos.length > 0,
    });

    const defaultRepos = useMemo(() => {
      return repoBranchConfigs
        .filter((c) => c.targetBranch !== null)
        .map((c) => ({ repo_id: c.repoId, target_branch: c.targetBranch! }));
    }, [repoBranchConfigs]);

    useEffect(() => {
      // Reset form when dialog opens
      if (modal.visible) {
        setTitle('');
        setDescription('');
        setExecutionMode('regular');
        setError(null);
      }
    }, [modal.visible]);

    const validateTitle = (value: string): string | null => {
      const trimmedValue = value.trim();
      if (!trimmedValue) return 'Goal title is required';
      if (trimmedValue.length < 3)
        return 'Goal title must be at least 3 characters';
      if (trimmedValue.length > 200)
        return 'Goal title must be 200 characters or less';
      return null;
    };

    const handleCreate = () => {
      const titleError = validateTitle(title);
      if (titleError) {
        setError(titleError);
        return;
      }

      setError(null);

      const goalTitle = `${GOAL_PREFIX}${title.trim()}`;
      // Use the title as the goal if no description is provided
      const goalText = description.trim() || title.trim();
      const goalDescription = buildGoalDescription(
        goalText,
        executionMode === 'auto_managed'
      );

      const executorProfileId = system.config?.executor_profile;
      if (!executorProfileId) {
        setError('No executor profile configured. Please set one in settings.');
        return;
      }

      createAndStart.mutate(
        {
          task: {
            project_id: projectId,
            title: goalTitle,
            description: goalDescription,
            status: null,
            parent_workspace_id: null,
            image_ids: null,
            shared_task_id: null,
          },
          executor_profile_id: executorProfileId,
          repos: defaultRepos,
          // Goals need the vibe_kanban MCP server to create/manage tasks
          include_vibe_kanban_mcp: true,
        },
        {
          onSuccess: (task) => {
            modal.resolve({
              action: 'created',
              task,
            } as GoalFormDialogResult);
            modal.hide();
          },
          onError: (err) => {
            setError(
              err instanceof Error ? err.message : 'Failed to create goal'
            );
          },
        }
      );
    };

    const handleCancel = () => {
      modal.resolve({ action: 'canceled' } as GoalFormDialogResult);
      modal.hide();
    };

    const handleOpenChange = (open: boolean) => {
      if (!open) {
        handleCancel();
      }
    };

    return (
      <Dialog open={modal.visible} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Goal</DialogTitle>
            <DialogDescription>
              Create a high-level objective. An agent will break it down into
              tasks.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="goal-title">Title</Label>
              <Input
                id="goal-title"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setError(null);
                }}
                placeholder="e.g., Add user authentication"
                maxLength={200}
                autoFocus
                disabled={createAndStart.isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="goal-description">Description (optional)</Label>
              <Textarea
                id="goal-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what you want to achieve..."
                rows={3}
                disabled={createAndStart.isPending}
              />
            </div>

            <div className="space-y-3">
              <Label>Execution Mode</Label>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setExecutionMode('regular')}
                  disabled={createAndStart.isPending}
                  className={cn(
                    'w-full flex items-start space-x-3 rounded-lg border p-3 text-left transition-colors',
                    executionMode === 'regular'
                      ? 'border-primary bg-primary/5'
                      : 'hover:bg-muted/50'
                  )}
                >
                  <div
                    className={cn(
                      'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                      executionMode === 'regular'
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-muted-foreground'
                    )}
                  >
                    {executionMode === 'regular' && (
                      <Check className="h-3 w-3" />
                    )}
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">Review first</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Child tasks land in Todo. You start them when ready.
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setExecutionMode('auto_managed')}
                  disabled={createAndStart.isPending}
                  className={cn(
                    'w-full flex items-start space-x-3 rounded-lg border p-3 text-left transition-colors',
                    executionMode === 'auto_managed'
                      ? 'border-primary bg-primary/5'
                      : 'hover:bg-muted/50'
                  )}
                >
                  <div
                    className={cn(
                      'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                      executionMode === 'auto_managed'
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-muted-foreground'
                    )}
                  >
                    {executionMode === 'auto_managed' && (
                      <Check className="h-3 w-3" />
                    )}
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <Bot className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">Auto-execute</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Agent creates and starts child tasks automatically.
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={createAndStart.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!title.trim() || createAndStart.isPending}
            >
              {createAndStart.isPending ? 'Creating...' : 'Create Goal'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

export const GoalFormDialog = defineModal<
  GoalFormDialogProps,
  GoalFormDialogResult
>(GoalFormDialogImpl);
