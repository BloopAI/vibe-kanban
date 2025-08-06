import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// Placeholder user interface - will be replaced by actual shared types
interface User {
  id: string;
  username: string;
  email: string;
  github_id?: number;
}

interface UserAvatarProps {
  user: User;
  size?: 'sm' | 'md' | 'lg';
  showTooltip?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: 'h-6 w-6',
  md: 'h-8 w-8',
  lg: 'h-10 w-10',
};

const textSizes = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
};

export function UserAvatar({ 
  user, 
  size = 'md', 
  showTooltip = true,
  className = '' 
}: UserAvatarProps) {
  const avatarElement = (
    <Avatar className={`${sizeClasses[size]} ${className}`}>
      <AvatarImage 
        src={user.github_id ? `https://avatars.githubusercontent.com/u/${user.github_id}?s=80` : undefined}
        alt={user.username}
      />
      <AvatarFallback className={textSizes[size]}>
        {user.username.charAt(0).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );

  if (!showTooltip) {
    return avatarElement;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {avatarElement}
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-center">
            <p className="font-medium">{user.username}</p>
            <p className="text-xs text-muted-foreground">{user.email}</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}