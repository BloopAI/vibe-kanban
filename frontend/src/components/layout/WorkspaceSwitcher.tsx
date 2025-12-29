import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  ChevronDown,
  Building2,
  Plus,
  Settings,
  Search,
  PenSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Workspace {
  id: string;
  name: string;
  icon?: string;
}

interface WorkspaceSwitcherProps {
  isCollapsed?: boolean;
}

const defaultWorkspace: Workspace = {
  id: 'default',
  name: 'vibe-kanban',
};

export function WorkspaceSwitcher({ isCollapsed }: WorkspaceSwitcherProps) {
  const [currentWorkspace] = useState<Workspace>(defaultWorkspace);
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  // Mock workspaces for future multi-workspace support
  const workspaces: Workspace[] = [defaultWorkspace];

  const filteredWorkspaces = workspaces.filter((ws) =>
    ws.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleQuickAction = (e: React.MouseEvent) => {
    e.stopPropagation();
    // TODO: Implement quick create action (new issue, project, etc.)
  };

  if (isCollapsed) {
    return (
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button className="flex items-center justify-center w-8 h-8 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors mx-auto">
              <Building2 className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {currentWorkspace.name}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div className="flex items-center gap-1 w-full">
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              'flex items-center gap-2 flex-1 px-2 py-1.5 rounded-md',
              'text-sm font-medium text-foreground',
              'hover:bg-accent/50 transition-colors',
              'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1'
            )}
          >
            <div className="flex items-center justify-center w-6 h-6 rounded bg-primary/10 text-primary shrink-0">
              <Building2 className="h-3.5 w-3.5" />
            </div>
            <span className="truncate flex-1 text-left">
              {currentWorkspace.name}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-64"
          sideOffset={8}
        >
          <div className="px-2 py-1.5">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search workspaces..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-7 text-sm"
              />
            </div>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
            Workspaces
          </DropdownMenuLabel>
          {filteredWorkspaces.map((workspace) => (
            <DropdownMenuItem
              key={workspace.id}
              className={cn(
                'gap-2',
                workspace.id === currentWorkspace.id && 'bg-accent'
              )}
            >
              <div className="flex items-center justify-center w-5 h-5 rounded bg-primary/10 text-primary">
                <Building2 className="h-3 w-3" />
              </div>
              <span className="flex-1 truncate">{workspace.name}</span>
              {workspace.id === currentWorkspace.id && (
                <span className="text-xs text-muted-foreground">Current</span>
              )}
            </DropdownMenuItem>
          ))}
          {filteredWorkspaces.length === 0 && (
            <div className="px-2 py-4 text-center text-sm text-muted-foreground">
              No workspaces found
            </div>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="gap-2">
            <Plus className="h-4 w-4" />
            <span>Create workspace</span>
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2">
            <Settings className="h-4 w-4" />
            <span>Workspace settings</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={handleQuickAction}
            >
              <PenSquare className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Quick create
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
