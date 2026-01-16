import { cn } from '@/lib/utils';
import { statusLabels, statusBadgeColors } from '@/utils/statusLabels';
import type { TaskStatus } from 'shared/types';

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
  const colorClass = statusBadgeColors[status] || statusBadgeColors.todo;
  const label = statusLabels[status] || status;

  const baseClass = cn(
    'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap',
    colorClass,
    interactive && 'cursor-pointer hover:opacity-80 transition-opacity',
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
