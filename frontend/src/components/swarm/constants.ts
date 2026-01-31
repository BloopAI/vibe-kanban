import {
  Play,
  Pause,
  AlertCircle,
  Clock,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// Swarm status configuration (active, paused, stopped)
export interface SwarmStatusConfigItem {
  label: string;
  variant: 'default' | 'secondary' | 'outline';
  icon: LucideIcon;
  className: string;
}

export const SWARM_STATUS_CONFIG: Record<string, SwarmStatusConfigItem> = {
  active: {
    label: 'Active',
    variant: 'default',
    icon: Play,
    className: 'bg-green-500/10 text-green-500 border-green-500/20',
  },
  paused: {
    label: 'Paused',
    variant: 'secondary',
    icon: Pause,
    className: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  },
  stopped: {
    label: 'Stopped',
    variant: 'outline',
    icon: AlertCircle,
    className: 'bg-muted text-muted-foreground',
  },
};

// Task status configuration (pending, running, completed, failed, cancelled)
export interface TaskStatusConfigItem {
  icon: LucideIcon;
  label: string;
  className: string;
  bgClassName: string;
  animate?: boolean;
  dotClassName?: string;
}

export const TASK_STATUS_CONFIG: Record<string, TaskStatusConfigItem> = {
  pending: {
    icon: Clock,
    label: 'Pending',
    className: 'text-muted-foreground',
    bgClassName: 'bg-muted/50',
    dotClassName: 'bg-muted-foreground',
  },
  running: {
    icon: Loader2,
    label: 'Running',
    className: 'text-blue-500',
    bgClassName: 'bg-blue-500/10',
    animate: true,
    dotClassName: 'bg-blue-500',
  },
  completed: {
    icon: CheckCircle2,
    label: 'Completed',
    className: 'text-green-500',
    bgClassName: 'bg-green-500/10',
    dotClassName: 'bg-green-500',
  },
  failed: {
    icon: AlertCircle,
    label: 'Failed',
    className: 'text-destructive',
    bgClassName: 'bg-destructive/10',
    dotClassName: 'bg-destructive',
  },
  cancelled: {
    icon: AlertCircle,
    label: 'Cancelled',
    className: 'text-muted-foreground',
    bgClassName: 'bg-muted/50',
    dotClassName: 'bg-muted-foreground',
  },
};

// Priority configuration for tasks
export interface PriorityConfigItem {
  label: string;
  className: string;
}

export const PRIORITY_CONFIG: Record<string, PriorityConfigItem> = {
  low: { label: 'Low', className: 'bg-muted text-muted-foreground' },
  medium: { label: 'Medium', className: 'bg-blue-500/10 text-blue-500' },
  high: { label: 'High', className: 'bg-orange-500/10 text-orange-500' },
  urgent: { label: 'Urgent', className: 'bg-red-500/10 text-red-500' },
};
