import {
  KanbanIcon,
  MagnifyingGlassIcon,
  FolderIcon,
  LightningIcon,
  EyeIcon,
  CheckCircleIcon,
  StackIcon,
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

type EmptyStateVariant =
  | 'no-boards'
  | 'no-tasks'
  | 'no-search-results'
  | 'no-active-sessions'
  | 'no-review-items'
  | 'no-group-items'
  | 'all-done';

interface EmptyStateProps {
  /** Pre-configured variant for common empty states */
  variant?: EmptyStateVariant;
  /** Custom icon (overrides variant icon) */
  icon?: React.ElementType;
  /** Title text */
  title?: string;
  /** Description text */
  description?: string;
  /** Optional action button */
  action?: {
    label: string;
    onClick: () => void;
  };
  /** Additional className */
  className?: string;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
}

const variantConfig: Record<
  EmptyStateVariant,
  {
    icon: React.ElementType;
    title: string;
    description: string;
  }
> = {
  'no-boards': {
    icon: KanbanIcon,
    title: 'No boards yet',
    description: 'Create your first project to get started',
  },
  'no-tasks': {
    icon: CheckCircleIcon,
    title: 'No tasks',
    description: 'This board is empty. Create a task to get started.',
  },
  'no-search-results': {
    icon: MagnifyingGlassIcon,
    title: 'No results found',
    description: 'Try adjusting your search or filters',
  },
  'no-active-sessions': {
    icon: LightningIcon,
    title: 'No active sessions',
    description: 'Start working on a task to see it here',
  },
  'no-review-items': {
    icon: EyeIcon,
    title: 'Nothing to review',
    description: 'Open PRs will appear here',
  },
  'no-group-items': {
    icon: FolderIcon,
    title: 'Empty group',
    description: 'Move boards here to organize them',
  },
  'all-done': {
    icon: CheckCircleIcon,
    title: 'All done!',
    description: 'No pending items in this view',
  },
};

/**
 * Empty state component following Linear.app design patterns.
 * Use for empty lists, no search results, and placeholder states.
 */
export function EmptyState({
  variant,
  icon: CustomIcon,
  title,
  description,
  action,
  className,
  size = 'md',
}: EmptyStateProps) {
  const config = variant ? variantConfig[variant] : null;
  const Icon = CustomIcon || config?.icon || StackIcon;
  const displayTitle = title || config?.title || 'Nothing here';
  const displayDescription = description || config?.description || '';

  const sizeClasses = {
    sm: {
      container: 'py-6 px-4',
      icon: 'size-6',
      title: 'text-xs',
      description: 'text-[10px] max-w-[160px]',
      button: 'text-[10px] px-2 py-1',
    },
    md: {
      container: 'py-10 px-6',
      icon: 'size-8',
      title: 'text-sm',
      description: 'text-xs max-w-[200px]',
      button: 'text-xs px-2.5 py-1.5',
    },
    lg: {
      container: 'py-16 px-8',
      icon: 'size-12',
      title: 'text-base',
      description: 'text-sm max-w-[280px]',
      button: 'text-sm px-3 py-2',
    },
  };

  const classes = sizeClasses[size];

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        'animate-fade-in',
        classes.container,
        className
      )}
    >
      <div
        className={cn(
          'flex items-center justify-center rounded-lg mb-3',
          'bg-panel/20',
          size === 'sm' && 'p-2',
          size === 'md' && 'p-3',
          size === 'lg' && 'p-4'
        )}
      >
        <Icon weight="duotone" className={cn(classes.icon, 'text-low/40')} />
      </div>
      <h3 className={cn(classes.title, 'font-medium text-normal mb-1')}>
        {displayTitle}
      </h3>
      {displayDescription && (
        <p className={cn(classes.description, 'text-low/60')}>
          {displayDescription}
        </p>
      )}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className={cn(
            classes.button,
            'mt-4 rounded-md',
            'bg-brand text-on-brand',
            'hover:bg-brand-hover',
            'transition-colors duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40'
          )}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

/**
 * Inline empty state for smaller contexts (table cells, small sections)
 */
export function InlineEmptyState({
  message = 'Nothing here',
  className,
}: {
  message?: string;
  className?: string;
}) {
  return (
    <div className={cn('text-[10px] text-low/50 italic py-2', className)}>
      {message}
    </div>
  );
}
