import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
  /** Width of the skeleton. Can be a Tailwind class or specific value */
  width?: string;
  /** Height of the skeleton. Can be a Tailwind class or specific value */
  height?: string;
  /** Whether to use rounded corners */
  rounded?: 'sm' | 'md' | 'lg' | 'full' | 'none';
}

/**
 * Loading skeleton component with shimmer animation.
 * Follows Linear.app design patterns for loading states.
 */
export function Skeleton({
  className,
  width,
  height,
  rounded = 'sm',
}: SkeletonProps) {
  const roundedClasses = {
    none: '',
    sm: 'rounded-sm',
    md: 'rounded-md',
    lg: 'rounded-lg',
    full: 'rounded-full',
  };

  return (
    <div
      className={cn('skeleton', roundedClasses[rounded], className)}
      style={{
        width: width,
        height: height,
      }}
    />
  );
}

/**
 * Pre-configured skeleton for task cards in the swimlane view
 */
export function TaskCardSkeleton() {
  return (
    <div className="w-full px-2 py-1.5 rounded-sm bg-secondary/40 animate-fade-in">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-start gap-1.5">
          <Skeleton className="size-3 shrink-0 mt-0.5" rounded="full" />
          <Skeleton className="flex-1 h-3" />
          <Skeleton className="size-3 shrink-0" rounded="sm" />
        </div>
        <Skeleton className="h-2 w-3/4" />
      </div>
    </div>
  );
}

/**
 * Pre-configured skeleton for a project swimlane row
 */
export function SwimlaneRowSkeleton() {
  return (
    <div className="grid grid-cols-[180px_repeat(5,minmax(120px,1fr))] border-b border-panel/20 animate-fade-in">
      {/* Project name cell */}
      <div className="px-2 py-2 flex items-center gap-1.5">
        <Skeleton className="size-3.5" rounded="sm" />
        <Skeleton className="flex-1 h-3" />
        <Skeleton className="w-4 h-3" />
      </div>
      {/* Status columns */}
      {[...Array(5)].map((_, i) => (
        <div
          key={i}
          className="px-2 py-2 border-l border-panel/40 min-h-[60px]"
        >
          {i < 3 && <TaskCardSkeleton />}
        </div>
      ))}
    </div>
  );
}

/**
 * Pre-configured skeleton for the board header
 */
export function BoardHeaderSkeleton() {
  return (
    <div className="flex items-center gap-3 px-3 py-2 animate-fade-in">
      <Skeleton className="h-7 w-48" rounded="md" />
      <div className="flex items-center gap-2 ml-auto">
        <Skeleton className="h-6 w-16" rounded="sm" />
        <Skeleton className="h-6 w-16" rounded="sm" />
        <Skeleton className="h-6 w-20" rounded="sm" />
      </div>
    </div>
  );
}

/**
 * Pre-configured skeleton for sidebar workspace items
 */
export function WorkspaceItemSkeleton() {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 animate-fade-in">
      <Skeleton className="size-3.5" rounded="sm" />
      <Skeleton className="flex-1 h-3" />
    </div>
  );
}
