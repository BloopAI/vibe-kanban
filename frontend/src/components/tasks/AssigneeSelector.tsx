import { User, ArrowDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { UserAvatar } from '@/components/tasks/UserAvatar';
import type { LocalAuthUser } from '@/lib/api';

interface AssigneeSelectorProps {
  users: LocalAuthUser[];
  selectedUserId: string | null;
  onChange: (userId: string | null) => void;
  disabled?: boolean;
  className?: string;
  showLabel?: boolean;
}

export function AssigneeSelector({
  users,
  selectedUserId,
  onChange,
  disabled,
  className = '',
  showLabel = false,
}: AssigneeSelectorProps) {
  const selectedUser = users.find((u) => u.id === selectedUserId);

  return (
    <div className="flex-1">
      {showLabel && (
        <Label htmlFor="assignee-selector" className="text-sm font-medium">
          Assignee
        </Label>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={`w-full justify-between text-xs ${showLabel ? 'mt-1.5' : ''} ${className}`}
            disabled={disabled}
            aria-label="Select assignee"
          >
            <div className="flex items-center gap-1.5 w-full">
              {selectedUser ? (
                <>
                  <UserAvatar
                    username={selectedUser.username}
                    imageUrl={selectedUser.avatar_url}
                    className="h-4 w-4"
                  />
                  <span className="truncate">
                    {selectedUser.display_name || selectedUser.username}
                  </span>
                </>
              ) : (
                <>
                  <User className="h-3 w-3" />
                  <span className="truncate text-muted-foreground">
                    Unassigned
                  </span>
                </>
              )}
            </div>
            <ArrowDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-60">
          {/* Unassign option */}
          <DropdownMenuItem
            onClick={() => onChange(null)}
            className={!selectedUserId ? 'bg-accent' : ''}
          >
            <div className="flex items-center gap-2">
              <div className="h-5 w-5 flex items-center justify-center rounded-full border border-border bg-muted">
                <X className="h-3 w-3 text-muted-foreground" />
              </div>
              <span className="text-muted-foreground">Unassigned</span>
            </div>
          </DropdownMenuItem>

          {users.length === 0 ? (
            <div className="p-2 text-sm text-muted-foreground text-center">
              No users available
            </div>
          ) : (
            users.map((user) => (
              <DropdownMenuItem
                key={user.id}
                onClick={() => onChange(user.id)}
                className={selectedUserId === user.id ? 'bg-accent' : ''}
              >
                <div className="flex items-center gap-2">
                  <UserAvatar
                    username={user.username}
                    imageUrl={user.avatar_url}
                    className="h-5 w-5"
                  />
                  <span>{user.display_name || user.username}</span>
                </div>
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
