import { cn } from '@/lib/utils';
import {
  ArrowFatLineUpIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  MinusIcon,
} from '@phosphor-icons/react';
import type { IssuePriority } from 'shared/remote-types';

// =============================================================================
// Status Dot Component
// =============================================================================

export interface StatusDotProps {
  color: string;
  className?: string;
}

export const StatusDot = ({ color, className }: StatusDotProps) => (
  <span
    className={cn('w-2 h-2 rounded-full shrink-0', className)}
    style={{ backgroundColor: color }}
  />
);

// =============================================================================
// Priority Icon Component
// =============================================================================

export interface PriorityIconProps {
  priority: IssuePriority;
  className?: string;
}

const priorityConfig: Record<
  IssuePriority,
  { icon: typeof ArrowUpIcon; colorClass: string }
> = {
  urgent: { icon: ArrowFatLineUpIcon, colorClass: 'text-error' },
  high: { icon: ArrowUpIcon, colorClass: 'text-brand' },
  medium: { icon: MinusIcon, colorClass: 'text-low' },
  low: { icon: ArrowDownIcon, colorClass: 'text-success' },
};

export const PriorityIcon = ({ priority, className }: PriorityIconProps) => {
  const { icon: IconComponent, colorClass } = priorityConfig[priority];
  return (
    <IconComponent
      className={cn('size-icon-xs', colorClass, className)}
      weight="bold"
    />
  );
};
