'use client';

import { cn } from '@/lib/utils';

export type KanbanBadgeProps = {
  name: string;
  className?: string;
};

export const KanbanBadge = ({ name, className }: KanbanBadgeProps) => {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center',
        'h-5 px-base',
        'bg-panel rounded-sm',
        'text-sm text-low font-medium',
        'whitespace-nowrap',
        className
      )}
    >
      {name}
    </span>
  );
};
