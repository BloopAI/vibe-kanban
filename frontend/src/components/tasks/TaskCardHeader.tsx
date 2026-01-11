import type { ReactNode } from 'react';
import { UserAvatar } from './UserAvatar';

interface HeaderAvatar {
  firstName?: string;
  lastName?: string;
  username?: string;
  imageUrl?: string;
}

interface TaskCardHeaderProps {
  title: ReactNode;
  avatar?: HeaderAvatar;
  left?: ReactNode;
  right?: ReactNode;
  className?: string;
  titleClassName?: string;
}

export function TaskCardHeader({
  title,
  avatar,
  left,
  right,
  className,
  titleClassName,
}: TaskCardHeaderProps) {
  return (
    <div className={`flex items-start gap-3 min-w-0 ${className ?? ''}`}>
      {left ? (
        <div className="flex items-center shrink-0">{left}</div>
      ) : null}
      <h4
        className={`flex-1 min-w-0 line-clamp-2 font-light text-sm ${titleClassName ?? ''}`}
      >
        {avatar ? (
          <UserAvatar
            firstName={avatar.firstName}
            lastName={avatar.lastName}
            username={avatar.username}
            imageUrl={avatar.imageUrl}
            className="mr-2 inline-flex align-middle h-5 w-5"
          />
        ) : null}
        <span className="align-middle">{title}</span>
      </h4>
      {right ? (
        <div className="flex items-center gap-1 shrink-0">{right}</div>
      ) : null}
    </div>
  );
}
