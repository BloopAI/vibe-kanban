import type { ExecutorProfileId } from 'shared/types';
import { cn } from '@/lib/utils';

interface ProfileVariantBadgeProps {
  profileVariant: ExecutorProfileId | null;
  className?: string;
}

export function ProfileVariantBadge({
  profileVariant,
  className,
}: ProfileVariantBadgeProps) {
  if (!profileVariant) {
    return null;
  }

  return (
    <span className={cn('text-xs text-muted-foreground', className)}>
      {profileVariant.executor}
      {profileVariant.variant && (
        <>
          <span className="mx-1">/</span>
          <span className="font-medium">{profileVariant.variant}</span>
        </>
      )}
    </span>
  );
}
