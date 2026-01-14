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

// Subtle background tints for status columns (using HSL with low opacity)
export const statusColumnBgColors: Record<TaskStatus, string> = {
  todo: 'hsl(var(--neutral-foreground) / 0.03)',
  inprogress: 'hsl(var(--info) / 0.05)',
  inreview: 'hsl(var(--warning) / 0.05)',
  done: 'hsl(var(--success) / 0.05)',
  cancelled: 'hsl(var(--destructive) / 0.03)',
};
