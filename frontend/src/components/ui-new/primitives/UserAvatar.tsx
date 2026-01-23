'use client';

import { cn } from '@/lib/utils';
import type { User } from 'shared/remote-types';

export interface UserAvatarProps {
  user: User;
  className?: string;
}

const buildInitials = (user: User): string => {
  const first = user.first_name?.trim().charAt(0)?.toUpperCase() ?? '';
  const last = user.last_name?.trim().charAt(0)?.toUpperCase() ?? '';

  if (first || last) {
    return `${first}${last}`.trim() || first || last || '?';
  }

  const handle = user.username?.trim().charAt(0)?.toUpperCase();
  return handle ?? '?';
};

const buildLabel = (user: User): string => {
  const name = [user.first_name, user.last_name]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join(' ');

  if (name) {
    return name;
  }

  if (user.username && user.username.trim()) {
    return user.username;
  }

  return 'User';
};

export const UserAvatar = ({ user, className }: UserAvatarProps) => {
  const initials = buildInitials(user);
  const label = buildLabel(user);

  return (
    <div
      className={cn(
        'flex size-icon-base shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-secondary text-xs font-medium text-low',
        className
      )}
      title={label}
      aria-label={label}
    >
      {initials}
    </div>
  );
};
