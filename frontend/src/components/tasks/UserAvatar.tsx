import { cn } from '@/lib/utils';

interface UserAvatarProps {
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  className?: string;
}

const buildInitials = (
  firstName?: string | null,
  lastName?: string | null,
  username?: string | null
) => {
  const first = firstName?.trim().charAt(0)?.toUpperCase() ?? '';
  const last = lastName?.trim().charAt(0)?.toUpperCase() ?? '';

  if (first || last) {
    return `${first}${last}`.trim() || first || last || '?';
  }

  const handle = username?.trim().charAt(0)?.toUpperCase();
  return handle ?? '?';
};

const buildLabel = (
  firstName?: string | null,
  lastName?: string | null,
  username?: string | null
) => {
  const name = [firstName, lastName]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join(' ');

  if (name) {
    return name;
  }

  if (username && username.trim()) {
    return username;
  }

  return 'Unassigned';
};

export const UserAvatar = ({
  firstName,
  lastName,
  username,
  className,
}: UserAvatarProps) => {
  const initials = buildInitials(firstName, lastName, username);
  const label = buildLabel(firstName, lastName, username);

  return (
    <div
      className={cn(
        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-xs font-medium text-muted-foreground',
        className
      )}
      title={label}
      aria-label={label}
    >
      {initials}
    </div>
  );
};
