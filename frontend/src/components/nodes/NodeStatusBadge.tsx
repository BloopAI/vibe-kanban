import { cn } from '@/lib/utils';
import type { NodeStatus } from '@/types/nodes';

interface NodeStatusBadgeProps {
  status: NodeStatus;
  className?: string;
}

const statusConfig: Record<
  NodeStatus,
  { label: string; bgColor: string; textColor: string; dotColor: string }
> = {
  online: {
    label: 'Online',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
    textColor: 'text-green-800 dark:text-green-300',
    dotColor: 'bg-green-500',
  },
  offline: {
    label: 'Offline',
    bgColor: 'bg-gray-100 dark:bg-gray-800',
    textColor: 'text-gray-600 dark:text-gray-400',
    dotColor: 'bg-gray-400',
  },
  busy: {
    label: 'Busy',
    bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
    textColor: 'text-yellow-800 dark:text-yellow-300',
    dotColor: 'bg-yellow-500',
  },
  pending: {
    label: 'Pending',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    textColor: 'text-blue-800 dark:text-blue-300',
    dotColor: 'bg-blue-500',
  },
  draining: {
    label: 'Draining',
    bgColor: 'bg-orange-100 dark:bg-orange-900/30',
    textColor: 'text-orange-800 dark:text-orange-300',
    dotColor: 'bg-orange-500',
  },
};

export function NodeStatusBadge({ status, className }: NodeStatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium',
        config.bgColor,
        config.textColor,
        className
      )}
    >
      <span
        className={cn('w-1.5 h-1.5 rounded-full', config.dotColor)}
        aria-hidden="true"
      />
      {config.label}
    </span>
  );
}
