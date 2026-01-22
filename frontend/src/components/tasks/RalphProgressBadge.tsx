import type { TaskWithAttemptStatus } from 'shared/types';
import { useRalphStatus } from '@/hooks/useRalphStatus';
import { cn } from '@/lib/utils';

interface RalphProgressBadgeProps {
  task: TaskWithAttemptStatus;
}

/**
 * Badge showing Ralph task progress in "completed/total" format.
 * - Gray: not started (0 completed)
 * - Blue: in progress (some completed)
 * - Green: complete (all completed)
 */
export function RalphProgressBadge({ task }: RalphProgressBadgeProps) {
  // Only show for Ralph tasks
  if (task.task_type !== 'ralph') {
    return null;
  }

  // Fetch status from API (reads from .ralph/prd.json)
  const { data: status } = useRalphStatus(task.id);

  // Use API data if available, otherwise fall back to task fields
  const completed = status?.completed_count ?? Number(task.ralph_current_story_index);
  const total = status?.total_stories ?? 0;

  // Don't show badge if no stories yet (PRD not created)
  if (total === 0) {
    // Show a simple "Ralph" badge when no PRD exists yet
    return (
      <span
        className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300"
        title="Ralph task - PRD not created yet"
      >
        Ralph
      </span>
    );
  }

  // Determine color based on progress
  const isNotStarted = completed === 0;
  const isComplete = completed >= total;

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        isNotStarted && 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
        !isNotStarted && !isComplete && 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
        isComplete && 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
      )}
      title={`Ralph progress: ${completed} of ${total} stories complete`}
    >
      {completed}/{total}
    </span>
  );
}
