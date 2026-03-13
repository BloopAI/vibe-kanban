import { ChatCircleDotsIcon } from '@phosphor-icons/react';

import { cn } from '../lib/cn';

interface ChatEmptyStateProps {
  title: string;
  description?: string;
  className?: string;
}

export function ChatEmptyState({
  title,
  description,
  className,
}: ChatEmptyStateProps) {
  return (
    <div
      className={cn(
        'mx-auto flex max-w-md flex-col items-center gap-2 text-center',
        className
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-full border border-border/70 bg-panel text-low">
        <ChatCircleDotsIcon className="size-6" />
      </div>
      <p className="text-sm font-medium text-normal">{title}</p>
      {description ? <p className="text-sm text-low">{description}</p> : null}
    </div>
  );
}
