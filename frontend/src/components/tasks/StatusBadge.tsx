import { cn } from '@/lib/utils';
import { statusLabels } from '@/utils/statusLabels';
import type { TaskStatus } from 'shared/types';

// Modern pill-style badge colors with subtle gradients
const statusPillColors: Record<TaskStatus, string> = {
  todo: 'bg-slate-100 text-slate-600 dark:bg-slate-700/50 dark:text-slate-300',
  inprogress: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  inreview: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
  done: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
  cancelled: 'bg-red-50 text-red-500 dark:bg-red-900/30 dark:text-red-400',
};

interface StatusBadgeProps {
  status: TaskStatus;
  className?: string;
  onClick?: () => void;
  interactive?: boolean;
}

export function StatusBadge({
  status,
  className,
  onClick,
  interactive = false,
}: StatusBadgeProps) {
  const colorClass = statusPillColors[status] || statusPillColors.todo;
  const label = statusLabels[status] || status;

  const baseClass = cn(
    'inline-flex items-center px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap',
    'transition-all duration-200',
    colorClass,
    interactive && 'cursor-pointer hover:opacity-80 hover:scale-105',
    className
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={baseClass}>
        {label}
      </button>
    );
  }

  return <span className={baseClass}>{label}</span>;
}
