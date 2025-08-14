import type { ProfileVariantLabel } from 'shared/types';
import { cn } from '@/lib/utils';

interface ProfileVariantBadgeProps {
  profileVariant: ProfileVariantLabel | null;
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
      {profileVariant.profile}
      {profileVariant.variant && (
        <>
          <span className="mx-1">/</span>
          <span className="font-medium">{profileVariant.variant}</span>
        </>
      )}
    </span>
  );
}

export default ProfileVariantBadge;
