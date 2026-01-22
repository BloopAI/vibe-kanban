import { Check, Circle, GitCommit, GitFork, Loader2 } from 'lucide-react';
import type { TaskWithAttemptStatus } from 'shared/types';
import { useRalphStatus } from '@/hooks/useRalphStatus';
import { useRalphAutoContinue } from '@/hooks/useRalphAutoContinue';
import { useRalphStoryCommits } from '@/hooks/useRalphStoryCommits';
import { useTaskAttemptsWithSessions } from '@/hooks/useTaskAttempts';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { openTaskForm } from '@/lib/openTaskForm';

interface RalphStoriesPanelProps {
  task: TaskWithAttemptStatus;
}

/**
 * Panel showing Ralph task stories with their completion status.
 * Only renders for Ralph tasks.
 */
export function RalphStoriesPanel({ task }: RalphStoriesPanelProps) {
  // Only show for Ralph tasks
  if (task.task_type !== 'ralph') {
    return null;
  }

  const { data: status, isLoading, isError } = useRalphStatus(task.id);
  const { data: commitsData } = useRalphStoryCommits(task.id);
  const autoContinueMutation = useRalphAutoContinue(task.id);
  const { data: workspaces = [] } = useTaskAttemptsWithSessions(task.id);

  // Get commits map for displaying commit hashes
  const storyCommits = commitsData?.commits ?? {};

  // Get the latest workspace for this task (for subtask creation)
  const latestWorkspace = workspaces[0];

  const handleCreateSubtask = (commitHash: string) => {
    if (!task.project_id || !latestWorkspace) return;
    const baseBranch = latestWorkspace.branch;
    if (!baseBranch) return;

    openTaskForm({
      mode: 'subtask',
      projectId: task.project_id,
      parentTaskAttemptId: latestWorkspace.id,
      initialBaseBranch: baseBranch,
      startFromRef: commitHash,
    });
  };

  if (isLoading) {
    return (
      <div className="border rounded-md p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading stories...</span>
        </div>
      </div>
    );
  }

  if (isError || !status) {
    return (
      <div className="border rounded-md p-4">
        <div className="text-muted-foreground">
          Unable to load stories. Task may not have a workspace yet.
        </div>
      </div>
    );
  }

  const { stories, current_story_index, completed_count, total_stories } = status;

  const allStoriesComplete = current_story_index === null || current_story_index === undefined;

  const handleAutoContinueToggle = (checked: boolean) => {
    autoContinueMutation.mutate(checked);
  };

  return (
    <div className="border rounded-md">
      <div className="p-3 border-b bg-muted/30">
        <div className="flex items-center justify-between">
          <span className="font-medium">Stories</span>
          <span className="text-sm text-muted-foreground">
            {completed_count}/{total_stories} complete
          </span>
        </div>
      </div>
      <div className="divide-y">
        {stories.map((story, index) => {
          const isCurrent = index === current_story_index;
          const isComplete = story.passes;
          const commit = storyCommits[story.id];

          return (
            <div
              key={story.id}
              className={cn(
                'p-3 flex items-start gap-3',
                isCurrent && 'bg-blue-50 dark:bg-blue-950/30',
              )}
            >
              <div className="flex-shrink-0 mt-0.5">
                {isComplete ? (
                  <div className="h-5 w-5 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                    <Check className="h-3 w-3 text-green-600 dark:text-green-400" />
                  </div>
                ) : isCurrent ? (
                  <div className="h-5 w-5 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                    <Circle className="h-3 w-3 text-blue-600 dark:text-blue-400 fill-current" />
                  </div>
                ) : (
                  <div className="h-5 w-5 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                    <Circle className="h-3 w-3 text-gray-400 dark:text-gray-500" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-muted-foreground">
                    {story.id}
                  </span>
                  {isCurrent && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
                      Next
                    </span>
                  )}
                  {isComplete && commit && (
                    <>
                      <span
                        className="text-xs font-mono px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 flex items-center gap-1"
                        title={commit.message}
                      >
                        <GitCommit className="h-3 w-3" />
                        {commit.commit_hash}
                      </span>
                      {latestWorkspace && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0"
                          title={`Create subtask from ${story.id} (${commit.commit_hash})`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCreateSubtask(commit.full_hash);
                          }}
                        >
                          <GitFork className="h-3 w-3" />
                        </Button>
                      )}
                    </>
                  )}
                </div>
                <p className="text-sm mt-0.5 truncate" title={story.title}>
                  {story.title}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      {/* Auto-continue toggle */}
      <div className="p-3 border-t flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-sm font-medium">Auto-continue</span>
          <span className="text-xs text-muted-foreground">
            {task.ralph_auto_continue
              ? `Enabled (max ${task.ralph_max_iterations} iterations)`
              : 'Disabled'}
          </span>
        </div>
        <Switch
          checked={task.ralph_auto_continue}
          onCheckedChange={handleAutoContinueToggle}
          disabled={autoContinueMutation.isPending || allStoriesComplete}
        />
      </div>
    </div>
  );
}
