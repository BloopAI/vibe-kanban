import { ListMagnifyingGlassIcon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

interface ChatToolSummaryProps {
  summary: string;
  className?: string;
}

export function ChatToolSummary({ summary, className }: ChatToolSummaryProps) {
  return (
    <div
      className={cn('flex items-center gap-base text-sm text-low', className)}
    >
      <ListMagnifyingGlassIcon className="shrink-0 size-icon-base" />
      <span>{summary}</span>
    </div>
  );
}
