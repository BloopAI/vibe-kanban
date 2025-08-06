import { Badge } from '@/components/ui/badge';
import { UserAvatar } from './UserAvatar';

// Placeholder user interface - will be replaced by actual shared types
interface User {
  id: string;
  username: string;
  email: string;
  github_id?: number;
}

interface UserBadgeProps {
  user: User;
  variant?: 'default' | 'secondary' | 'outline';
  size?: 'sm' | 'md';
  showAvatar?: boolean;
  className?: string;
}

export function UserBadge({ 
  user, 
  variant = 'secondary',
  size = 'sm',
  showAvatar = true,
  className = '' 
}: UserBadgeProps) {
  return (
    <Badge variant={variant} className={`flex items-center gap-1.5 ${className}`}>
      {showAvatar && (
        <UserAvatar 
          user={user} 
          size="sm" 
          showTooltip={false}
          className="h-4 w-4"
        />
      )}
      <span className={size === 'sm' ? 'text-xs' : 'text-sm'}>
        {user.username}
      </span>
    </Badge>
  );
}