import { TaskStatus } from 'shared/types';

export const statusLabels: Record<TaskStatus, string> = {
  todo: 'To Do',
  inprogress: 'In Progress',
  inreview: 'In Review',
  done: 'Done',
  cancelled: 'Cancelled',
};

export const statusBoardColors: Record<TaskStatus, string> = {
  todo: '--neutral-foreground',
  inprogress: '--info',
  inreview: '--warning',
  done: '--success',
  cancelled: '--destructive',
};

// Light mode optimized badge colors with dark mode variants
export const statusBadgeColors: Record<TaskStatus, string> = {
  todo: 'bg-gray-100 text-gray-700 dark:bg-neutral dark:text-neutral-foreground',
  inprogress: 'bg-blue-100 text-blue-700 dark:bg-info/20 dark:text-info-foreground',
  inreview: 'bg-amber-100 text-amber-700 dark:bg-warning/20 dark:text-warning-foreground',
  done: 'bg-green-100 text-green-700 dark:bg-success/20 dark:text-success-foreground',
  cancelled: 'bg-red-100 text-red-700 dark:bg-destructive/20 dark:text-destructive',
};
