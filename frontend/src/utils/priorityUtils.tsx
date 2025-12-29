import { AlertCircle, Minus, Signal, SignalMedium, SignalLow } from 'lucide-react';
import type { ReactNode } from 'react';

// Priority levels: 0=none, 1=urgent, 2=high, 3=medium, 4=low
export type PriorityLevel = 0 | 1 | 2 | 3 | 4;

export interface PriorityInfo {
  label: string;
  icon: ReactNode;
  color: string;
  shortcut: string;
}

export const priorityConfig: Record<PriorityLevel, PriorityInfo> = {
  0: {
    label: 'No priority',
    icon: <Minus className="h-4 w-4" />,
    color: 'text-muted-foreground',
    shortcut: '0',
  },
  1: {
    label: 'Urgent',
    icon: <AlertCircle className="h-4 w-4" />,
    color: 'text-orange-500',
    shortcut: '1',
  },
  2: {
    label: 'High',
    icon: <Signal className="h-4 w-4" />,
    color: 'text-orange-400',
    shortcut: '2',
  },
  3: {
    label: 'Medium',
    icon: <SignalMedium className="h-4 w-4" />,
    color: 'text-yellow-500',
    shortcut: '3',
  },
  4: {
    label: 'Low',
    icon: <SignalLow className="h-4 w-4" />,
    color: 'text-slate-400',
    shortcut: '4',
  },
};

export function getPriorityInfo(priority: number | null | undefined): PriorityInfo {
  const level = (priority ?? 0) as PriorityLevel;
  return priorityConfig[level] || priorityConfig[0];
}

export function PriorityIcon({ priority, className }: { priority: number | null | undefined; className?: string }) {
  const info = getPriorityInfo(priority);
  return (
    <span className={`${info.color} ${className || ''}`}>
      {info.icon}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: number | null | undefined }) {
  const info = getPriorityInfo(priority);
  if (priority === 0 || priority === null || priority === undefined) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded border text-xs text-muted-foreground">
        ---
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs ${info.color}`}>
      {info.icon}
    </span>
  );
}
