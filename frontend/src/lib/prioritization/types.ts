import type { TaskPriority, TaskWithAttemptStatus } from 'shared/types';

/**
 * Factors that influence task priority scoring
 */
export type PriorityFactor =
  | 'age' // How long task has been in backlog
  | 'dueDate' // Proximity to due date
  | 'keywords' // Urgent words in title/description
  | 'labels' // Label-based priority hints
  | 'stale' // Items that haven't changed status in a while
  | 'blocked'; // Tasks that are blockers (based on description)

/**
 * Explanation for why a priority was suggested
 */
export interface PriorityReason {
  factor: PriorityFactor;
  contribution: number; // Weighted score contribution (0 to weight max)
  explanation: string;
}

/**
 * A priority suggestion for a single task
 */
export interface PrioritySuggestion {
  taskId: string;
  task: TaskWithAttemptStatus;
  currentPriority: TaskPriority;
  suggestedPriority: TaskPriority;
  score: number; // 0.0 to 1.0
  reasons: PriorityReason[];
  /** User's decision: null = pending, true = accepted, false = rejected */
  accepted: boolean | null;
}

/**
 * Result of applying priority changes
 */
export interface PrioritizeResult {
  updatedCount: number;
  skippedCount: number;
}

/**
 * Props for the PrioritizeTasksDialog
 */
export interface PrioritizeTasksDialogProps {
  projectId: string;
  tasks: TaskWithAttemptStatus[];
}
