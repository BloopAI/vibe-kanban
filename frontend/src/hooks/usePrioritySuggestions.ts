import { useMemo } from 'react';
import type { TaskWithAttemptStatus } from 'shared/types';
import type { PrioritySuggestion } from '@/lib/prioritization';
import {
  computeTaskScore,
  scoreToPriority,
  shouldSuggestChange,
} from '@/lib/prioritization';

/**
 * Hook that computes priority suggestions for a list of tasks.
 * Only returns tasks where the suggested priority differs from current.
 */
export function usePrioritySuggestions(
  tasks: TaskWithAttemptStatus[]
): PrioritySuggestion[] {
  return useMemo(() => {
    const suggestions: PrioritySuggestion[] = [];

    for (const task of tasks) {
      // Skip completed/cancelled tasks
      if (task.status === 'done' || task.status === 'cancelled') {
        continue;
      }

      const { score, reasons } = computeTaskScore(task);
      const suggestedPriority = scoreToPriority(score);
      const currentPriority = task.priority;

      if (shouldSuggestChange(currentPriority, suggestedPriority)) {
        suggestions.push({
          taskId: task.id,
          task,
          currentPriority,
          suggestedPriority,
          score,
          reasons,
          accepted: null,
        });
      }
    }

    // Sort by score descending (highest priority suggestions first)
    suggestions.sort((a, b) => b.score - a.score);

    return suggestions;
  }, [tasks]);
}
