import { useState, useEffect } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { User } from 'lucide-react';

// Placeholder user interface - will be replaced by actual shared types
interface UserOption {
  id: string;
  username: string;
  email: string;
  github_id?: number;
}

interface UserSelectorProps {
  value?: string;
  onValueChange: (userId: string | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  allowUnassigned?: boolean;
  className?: string;
}

export function UserSelector({
  value,
  onValueChange,
  placeholder = "Select user",
  disabled = false,
  allowUnassigned = true,
  className,
}: UserSelectorProps) {
  const [users, setUsers] = useState<UserOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch users from API
  useEffect(() => {
    const loadUsers = async () => {
      try {
        setIsLoading(true);
        // Use the multiuser auth API to fetch users
        const response = await fetch('/api/auth/users', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('automagik_auth_token') || ''}`,
          },
        });
        
        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            setUsers(result.data || []);
          }
        }
      } catch (error) {
        console.error('Error fetching users:', error);
        // Fall back to mock users for development
        const mockUsers: UserOption[] = [
          {
            id: '1',
            username: 'alice',
            email: 'alice@example.com',
            github_id: 12345,
          },
          {
            id: '2',
            username: 'bob',
            email: 'bob@example.com',
            github_id: 67890,
          },
        ];
        setUsers(mockUsers);
      } finally {
        setIsLoading(false);
      }
    };

    loadUsers();
  }, []);

  const handleValueChange = (selectedValue: string) => {
    if (selectedValue === 'unassigned') {
      onValueChange(undefined);
    } else {
      onValueChange(selectedValue);
    }
  };

  const selectedUser = users.find(user => user.id === value);

  return (
    <Select
      value={value || 'unassigned'}
      onValueChange={handleValueChange}
      disabled={disabled || isLoading}
    >
      <SelectTrigger className={className}>
        <SelectValue>
          {selectedUser ? (
            <div className="flex items-center gap-2">
              <Avatar className="h-5 w-5">
                <AvatarImage 
                  src={selectedUser.github_id ? `https://avatars.githubusercontent.com/u/${selectedUser.github_id}?s=40` : undefined}
                  alt={selectedUser.username}
                />
                <AvatarFallback className="text-xs">
                  {selectedUser.username.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm">{selectedUser.username}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-muted-foreground">
              <User className="h-4 w-4" />
              <span>{placeholder}</span>
            </div>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {allowUnassigned && (
          <SelectItem value="unassigned">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span>Unassigned</span>
            </div>
          </SelectItem>
        )}
        {users.map((user) => (
          <SelectItem key={user.id} value={user.id}>
            <div className="flex items-center gap-2">
              <Avatar className="h-5 w-5">
                <AvatarImage 
                  src={user.github_id ? `https://avatars.githubusercontent.com/u/${user.github_id}?s=40` : undefined}
                  alt={user.username}
                />
                <AvatarFallback className="text-xs">
                  {user.username.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col">
                <span className="text-sm font-medium">{user.username}</span>
                <span className="text-xs text-muted-foreground">{user.email}</span>
              </div>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}