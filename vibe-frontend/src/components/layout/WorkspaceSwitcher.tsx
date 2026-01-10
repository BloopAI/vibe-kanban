import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
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
  FolderKanban,
  Users,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TeamFormDialog } from '@/components/dialogs/teams/TeamFormDialog';
import { ProjectFormDialog } from '@/components/dialogs/projects/ProjectFormDialog';
import { useWorkspaceOptional } from '@/contexts/WorkspaceContext';

interface WorkspaceSwitcherProps {
  isCollapsed?: boolean;
}

export function WorkspaceSwitcher({ isCollapsed }: WorkspaceSwitcherProps) {
  const navigate = useNavigate();
  const workspaceContext = useWorkspaceOptional();
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  // Get workspaces from context or use fallback
  const workspaces = workspaceContext?.workspaces ?? [];
  const currentWorkspace = workspaceContext?.currentWorkspace;
  const isLoading = workspaceContext?.isLoading ?? false;
  const setCurrentWorkspaceId = workspaceContext?.setCurrentWorkspaceId;

  // Filter workspaces by search
  const filteredWorkspaces = useMemo(
    () =>
      workspaces.filter((ws) =>
        ws.name.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [workspaces, searchQuery]
  );

  // Display name for current workspace
  const displayName = currentWorkspace?.name ?? 'iKanban';
  const displayColor = currentWorkspace?.color;

  const handleCreateWorkspace = () => {
    setIsOpen(false);
    // Navigate to workspace setup wizard (full page)
    navigate('/workspace/new');
  };

  const handleWorkspaceSettings = () => {
    setIsOpen(false);
    // Navigate to workspace settings (will be implemented)
    navigate('/settings/workspace');
  };

  const handleCreateProject = async () => {
    try {
      await ProjectFormDialog.show({});
    } catch {
      // User cancelled
    }
  };

  const handleCreateTeam = async () => {
    try {
      await TeamFormDialog.show({});
    } catch {
      // User cancelled
    }
  };

  // Handle workspace switch
  const handleWorkspaceSwitch = (workspaceId: string) => {
    if (setCurrentWorkspaceId) {
      setCurrentWorkspaceId(workspaceId);
    }
    setIsOpen(false);
  };

  if (isCollapsed) {
    return (
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="flex items-center justify-center w-8 h-8 rounded-md transition-colors mx-auto"
              style={{
                backgroundColor: displayColor ? `${displayColor}20` : undefined,
                color: displayColor || undefined,
              }}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Building2 className="h-4 w-4" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {displayName}
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
            <div
              className="flex items-center justify-center w-6 h-6 rounded shrink-0"
              style={{
                backgroundColor: displayColor ? `${displayColor}20` : 'hsl(var(--primary) / 0.1)',
                color: displayColor || 'hsl(var(--primary))',
              }}
            >
              {isLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Building2 className="h-3.5 w-3.5" />
              )}
            </div>
            <span className="truncate flex-1 text-left">
              {displayName}
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
              onClick={() => handleWorkspaceSwitch(workspace.id)}
              className={cn(
                'gap-2 cursor-pointer',
                workspace.id === currentWorkspace?.id && 'bg-accent'
              )}
            >
              <div
                className="flex items-center justify-center w-5 h-5 rounded"
                style={{
                  backgroundColor: workspace.color ? `${workspace.color}20` : 'hsl(var(--primary) / 0.1)',
                  color: workspace.color || 'hsl(var(--primary))',
                }}
              >
                <Building2 className="h-3 w-3" />
              </div>
              <span className="flex-1 truncate">{workspace.name}</span>
              {workspace.id === currentWorkspace?.id && (
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
          <DropdownMenuItem className="gap-2" onClick={handleCreateWorkspace}>
            <Plus className="h-4 w-4" />
            <span>Create workspace</span>
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2" onClick={handleWorkspaceSettings}>
            <Settings className="h-4 w-4" />
            <span>Workspace settings</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                >
                  <PenSquare className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Quick create
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <DropdownMenuContent align="end" sideOffset={8}>
          <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
            Create new
          </DropdownMenuLabel>
          <DropdownMenuItem onClick={handleCreateProject}>
            <FolderKanban className="h-4 w-4 mr-2" />
            New Project
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleCreateTeam}>
            <Users className="h-4 w-4 mr-2" />
            New Team
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
