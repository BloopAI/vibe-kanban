import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Button } from './ui/button';
import { UserAvatar } from './user/UserAvatar';
import { useAuth } from './auth-provider';
import { MultiuserGitHubLoginDialog } from './MultiuserGitHubLoginDialog';
import { LogOut, User, Github } from 'lucide-react';

export function UserMenu() {
  const { user, isAuthenticated, logout } = useAuth();
  const [showLoginDialog, setShowLoginDialog] = useState(false);

  if (!isAuthenticated || !user) {
    return (
      <>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowLoginDialog(true)}
          className="flex items-center gap-2"
        >
          <User className="h-4 w-4" />
          <span className="hidden sm:inline">Sign In</span>
        </Button>
        <MultiuserGitHubLoginDialog
          open={showLoginDialog}
          onOpenChange={setShowLoginDialog}
        />
      </>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="flex items-center gap-2">
            <UserAvatar
              user={{
                id: user.id,
                username: user.username,
                email: user.email,
                github_id: user.github_id,
              }}
              size="sm"
              showTooltip={false}
            />
            <span className="hidden sm:inline text-sm font-medium">
              {user.username}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <div className="px-2 py-1.5">
            <div className="flex items-center gap-3">
              <UserAvatar
                user={{
                  id: user.id,
                  username: user.username,
                  email: user.email,
                  github_id: user.github_id,
                }}
                size="md"
                showTooltip={false}
              />
              <div className="flex flex-col">
                <span className="text-sm font-medium">{user.username}</span>
                <span className="text-xs text-muted-foreground">{user.email}</span>
              </div>
            </div>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <a
              href={`https://github.com/${user.username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 cursor-pointer"
            >
              <Github className="h-4 w-4" />
              View GitHub Profile
            </a>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={logout}
            className="flex items-center gap-2 text-red-600 focus:text-red-600"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}