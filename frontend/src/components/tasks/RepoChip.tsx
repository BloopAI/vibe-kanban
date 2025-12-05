import { memo } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface RepoChipProps {
  name: string;
  className?: string;
}

export const RepoChip = memo(function RepoChip({
  name,
  className,
}: RepoChipProps) {
  return (
    <Badge
      variant="secondary"
      className={cn('transition-colors inline-block truncate', className)}
    >
      {name}
    </Badge>
  );
});
