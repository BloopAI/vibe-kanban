import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function is_planning_executor_type(executorType: string): boolean {
  return executorType === 'claude-plan';
}
