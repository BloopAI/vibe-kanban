import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useCallback, useState } from 'react';
import { siDiscord } from 'simple-icons';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  FolderOpen,
  Settings,
  BookOpen,
  MessageCircleQuestion,
  MessageCircle,
  Menu,
  Plus,
  LogOut,
  LogIn,
  Github,
  RefreshCw,
  Unlink,
  Loader2,
  ChevronDown,
} from 'lucide-react';
import {
  SignedIn,
  SignedOut,
  SignInButton,
  SignUpButton,
  UserButton,
} from '@clerk/clerk-react';
import { Logo } from '@/components/Logo';
import { SearchBar } from '@/components/SearchBar';
import { useSearch } from '@/contexts/SearchContext';
import { openTaskForm } from '@/lib/openTaskForm';
import { useProject } from '@/contexts/ProjectContext';
import { useOpenProjectInEditor } from '@/hooks/useOpenProjectInEditor';
import { OpenInIdeButton } from '@/components/ide/OpenInIdeButton';
import { useProjectRepos } from '@/hooks';
import { useDiscordOnlineCount } from '@/hooks/useDiscordOnlineCount';
import { useTranslation } from 'react-i18next';
import { Switch } from '@/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { OAuthDialog } from '@/components/dialogs/global/OAuthDialog';
import { useUserSystem } from '@/components/ConfigProvider';
import { oauthApi } from '@/lib/api';
import { useWorkspaceGitHubConnection, useWorkspaceGitHubMutations } from '@/hooks/useWorkspaceGitHub';
import { teamsApi } from '@/lib/api';

const INTERNAL_NAV = [{ label: 'Projects', icon: FolderOpen, to: '/projects' }];

const EXTERNAL_LINKS = [
  {
    label: 'Docs',
    icon: BookOpen,
    href: 'https://vibekanban.com/docs',
  },
  {
    label: 'Support',
    icon: MessageCircleQuestion,
    href: 'https://github.com/BloopAI/vibe-kanban/issues',
  },
  {
    label: 'Discord',
    icon: MessageCircle,
    href: 'https://discord.gg/AC4nwVtJM3',
  },
];

function NavDivider() {
  return (
    <div
      className="mx-2 h-6 w-px bg-border/60"
      role="separator"
      aria-orientation="vertical"
    />
  );
}

export function Navbar() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { projectId, project } = useProject();
  const { query, setQuery, active, clear, registerInputRef } = useSearch();
  const handleOpenInEditor = useOpenProjectInEditor(project || null);
  const { data: onlineCount } = useDiscordOnlineCount();
  const { loginStatus, reloadSystem } = useUserSystem();

  const { data: repos } = useProjectRepos(projectId);
  const isSingleRepoProject = repos?.length === 1;
  const { data: githubConnection, refetch: refetchGitHubConnection } = useWorkspaceGitHubConnection();
  const { deleteConnection: deleteGitHubConnection } = useWorkspaceGitHubMutations();
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const setSearchBarRef = useCallback(
    (node: HTMLInputElement | null) => {
      registerInputRef(node);
    },
    [registerInputRef]
  );
  const { t } = useTranslation(['tasks', 'common']);
  // Navbar is global, but the share tasks toggle only makes sense on the tasks route
  const isTasksRoute = /^\/projects\/[^/]+\/tasks/.test(location.pathname);
  const showSharedTasks = searchParams.get('shared') !== 'off';
  const shouldShowSharedToggle =
    isTasksRoute && active && project?.remote_project_id != null;

  const handleSharedToggle = useCallback(
    (checked: boolean) => {
      const params = new URLSearchParams(searchParams);
      if (checked) {
        params.delete('shared');
      } else {
        params.set('shared', 'off');
      }
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const handleCreateTask = () => {
    if (projectId) {
      openTaskForm({ mode: 'create', projectId });
    }
  };

  const handleOpenInIDE = () => {
    handleOpenInEditor();
  };

  const handleOpenOAuth = async () => {
    const profile = await OAuthDialog.show();
    if (profile) {
      await reloadSystem();
    }
  };

  const handleOAuthLogout = async () => {
    try {
      await oauthApi.logout();
      await reloadSystem();
    } catch (err) {
      console.error('Error logging out:', err);
    }
  };

  const isOAuthLoggedIn = loginStatus?.status === 'loggedin';

  // GitHub connection handlers
  const handleConnectGitHub = () => {
    const backendUrl = window.location.origin;
    const oauthUrl = `${backendUrl}/api/oauth/github/authorize?callback_url=${encodeURIComponent(window.location.origin + '/settings/github-callback')}`;
    const popup = window.open(oauthUrl, 'github-oauth', 'width=600,height=700,scrollbars=yes');

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'github-oauth-success') {
        popup?.close();
        refetchGitHubConnection();
        window.removeEventListener('message', handleMessage);
      } else if (event.data?.type === 'github-oauth-error') {
        popup?.close();
        window.removeEventListener('message', handleMessage);
      }
    };
    window.addEventListener('message', handleMessage);
  };

  const handleDisconnectGitHub = async () => {
    try {
      await deleteGitHubConnection.mutateAsync();
      setShowDisconnectDialog(false);
    } catch (err) {
      console.error('Error disconnecting GitHub:', err);
    }
  };

  const handleSyncGitHub = async () => {
    if (!githubConnection?.repositories.length) return;
    setIsSyncing(true);
    try {
      // Sync all linked repositories
      for (const repo of githubConnection.repositories) {
        await teamsApi.pullDocumentsFromGitHub('', repo.id); // Empty team_id uses workspace
      }
    } catch (err) {
      console.error('Error syncing:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="border-b bg-background">
      <div className="w-full px-3">
        <div className="flex items-center h-12 py-2">
          <div className="flex-1 flex items-center">
            <Link to="/projects">
              <Logo />
            </Link>
            <a
              href="https://discord.gg/AC4nwVtJM3"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Join our Discord"
              className="hidden sm:inline-flex items-center ml-3 text-xs font-medium overflow-hidden border h-6"
            >
              <span className="bg-muted text-foreground flex items-center p-2 border-r">
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d={siDiscord.path} />
                </svg>
              </span>
              <span
                className=" h-full items-center flex p-2"
                aria-live="polite"
              >
                {onlineCount != null
                  ? `${onlineCount.toLocaleString()} online`
                  : 'online'}
              </span>
            </a>
          </div>

          <div className="hidden sm:flex items-center gap-2">
            <SearchBar
              ref={setSearchBarRef}
              className="shrink-0"
              value={query}
              onChange={setQuery}
              disabled={!active}
              onClear={clear}
              project={project || null}
            />
          </div>

          <div className="flex flex-1 items-center justify-end gap-1">
            {isOAuthLoggedIn && shouldShowSharedToggle ? (
              <>
                <div className="flex items-center gap-4">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div>
                          <Switch
                            checked={showSharedTasks}
                            onCheckedChange={handleSharedToggle}
                            aria-label={t('tasks:filters.sharedToggleAria')}
                          />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        {t('tasks:filters.sharedToggleTooltip')}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <NavDivider />
              </>
            ) : null}

            {projectId ? (
              <>
                <div className="flex items-center gap-1">
                  {isSingleRepoProject && (
                    <OpenInIdeButton
                      onClick={handleOpenInIDE}
                      className="h-9 w-9"
                    />
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9"
                    onClick={handleCreateTask}
                    aria-label="Create new task"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <NavDivider />
              </>
            ) : null}

            {/* GitHub Connection */}
            <div className="hidden sm:flex items-center">
              {githubConnection ? (
                <>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="inline-flex items-center text-xs font-medium overflow-hidden border h-6 hover:bg-muted/50 transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
                      >
                        <span className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 flex items-center px-2 border-r h-full">
                          <Github className="h-3.5 w-3.5" />
                        </span>
                        <span className="px-2 truncate max-w-[100px]">
                          @{githubConnection.github_username || 'Connected'}
                        </span>
                        <ChevronDown className="h-3 w-3 mr-1 text-muted-foreground" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onSelect={handleSyncGitHub}
                        disabled={isSyncing || !githubConnection.repositories.length}
                      >
                        <RefreshCw className={`mr-2 h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
                        {isSyncing ? 'Syncing...' : 'Sync Repositories'}
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to="/settings/organizations">
                          <Settings className="mr-2 h-4 w-4" />
                          Manage Repositories
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={() => setShowDisconnectDialog(true)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Unlink className="mr-2 h-4 w-4" />
                        Disconnect GitHub
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <NavDivider />
                </>
              ) : (
                <>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={handleConnectGitHub}
                          className="inline-flex items-center text-xs font-medium overflow-hidden border h-6 hover:bg-muted/50 transition-colors"
                        >
                          <span className="bg-muted text-muted-foreground flex items-center px-2 border-r h-full">
                            <Github className="h-3.5 w-3.5" />
                          </span>
                          <span className="px-2">Connect</span>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        Connect GitHub to sync documents
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <NavDivider />
                </>
              )}
            </div>

            {/* Clerk Authentication */}
            <div className="hidden sm:flex items-center">
              <SignedOut>
                <div className="flex items-center gap-1">
                  <SignInButton mode="modal">
                    <Button variant="ghost" size="sm" className="h-8 text-xs">
                      <LogIn className="mr-1.5 h-3.5 w-3.5" />
                      Sign In
                    </Button>
                  </SignInButton>
                  <SignUpButton mode="modal">
                    <Button variant="default" size="sm" className="h-8 text-xs">
                      Sign Up
                    </Button>
                  </SignUpButton>
                </div>
              </SignedOut>
              <SignedIn>
                <UserButton
                  appearance={{
                    elements: {
                      avatarBox: 'h-8 w-8',
                    },
                  }}
                />
              </SignedIn>
              <NavDivider />
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                asChild
                aria-label="Settings"
              >
                <Link
                  to={
                    projectId
                      ? `/settings/projects?projectId=${projectId}`
                      : '/settings'
                  }
                >
                  <Settings className="h-4 w-4" />
                </Link>
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9"
                    aria-label="Main navigation"
                  >
                    <Menu className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>

                <DropdownMenuContent align="end">
                  {INTERNAL_NAV.map((item) => {
                    const active = location.pathname.startsWith(item.to);
                    const Icon = item.icon;
                    return (
                      <DropdownMenuItem
                        key={item.to}
                        asChild
                        className={active ? 'bg-accent' : ''}
                      >
                        <Link to={item.to}>
                          <Icon className="mr-2 h-4 w-4" />
                          {item.label}
                        </Link>
                      </DropdownMenuItem>
                    );
                  })}

                  <DropdownMenuSeparator />

                  {EXTERNAL_LINKS.map((item) => {
                    const Icon = item.icon;
                    return (
                      <DropdownMenuItem key={item.href} asChild>
                        <a
                          href={item.href}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Icon className="mr-2 h-4 w-4" />
                          {item.label}
                        </a>
                      </DropdownMenuItem>
                    );
                  })}

                  <DropdownMenuSeparator />

                  {isOAuthLoggedIn ? (
                    <DropdownMenuItem onSelect={handleOAuthLogout}>
                      <LogOut className="mr-2 h-4 w-4" />
                      {t('common:signOut')}
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onSelect={handleOpenOAuth}>
                      <LogIn className="mr-2 h-4 w-4" />
                      Sign in
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </div>

      {/* Disconnect GitHub Confirmation Dialog */}
      <Dialog open={showDisconnectDialog} onOpenChange={setShowDisconnectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect GitHub</DialogTitle>
            <DialogDescription>
              Are you sure you want to disconnect your GitHub account? This will unlink all repositories and stop syncing.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDisconnectDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDisconnectGitHub}
              disabled={deleteGitHubConnection.isPending}
            >
              {deleteGitHubConnection.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Disconnecting...
                </>
              ) : (
                'Disconnect'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
