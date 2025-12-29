import { Circle, CircleDot, CheckCircle2, XCircle, Clock, CircleDashed } from 'lucide-react';
import type { TaskStatus } from 'shared/types';
import type { ReactNode } from 'react';

export interface StatusIconInfo {
  icon: ReactNode;
  color: string;
  bgColor: string;
}

export const statusIconConfig: Record<TaskStatus, StatusIconInfo> = {
  todo: {
    icon: <Circle className="h-4 w-4" />,
    color: 'text-slate-400',
    bgColor: 'bg-slate-100',
  },
  inprogress: {
    icon: <CircleDot className="h-4 w-4" />,
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-50',
  },
  inreview: {
    icon: <Clock className="h-4 w-4" />,
    color: 'text-blue-500',
    bgColor: 'bg-blue-50',
  },
  done: {
    icon: <CheckCircle2 className="h-4 w-4" />,
    color: 'text-green-500',
    bgColor: 'bg-green-50',
  },
  cancelled: {
    icon: <XCircle className="h-4 w-4" />,
    color: 'text-red-500',
    bgColor: 'bg-red-50',
  },
};

export function StatusIcon({ status, className }: { status: TaskStatus; className?: string }) {
  const info = statusIconConfig[status] || statusIconConfig.todo;
  return (
    <span className={`${info.color} ${className || ''}`}>
      {info.icon}
    </span>
  );
}

// Backlog icon for hidden columns section
export function BacklogIcon({ className }: { className?: string }) {
  return (
    <span className={`text-slate-300 ${className || ''}`}>
      <CircleDashed className="h-4 w-4" />
    </span>
  );
}
