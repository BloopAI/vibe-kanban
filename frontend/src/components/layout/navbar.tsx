import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useCallback } from 'react';
import { siDiscord } from 'simple-icons';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  FolderOpen,
  Settings,
  BookOpen,
  MessageCircleQuestion,
  MessageCircle,
  Menu,
  Plus,
} from 'lucide-react';
import { Logo } from '@/components/logo';
import { SearchBar } from '@/components/search-bar';
import { useSearch } from '@/contexts/search-context';
import { openTaskForm } from '@/lib/openTaskForm';
import { useProject } from '@/contexts/project-context';
import { showProjectForm } from '@/lib/modals';
import { useOpenProjectInEditor } from '@/hooks/useOpenProjectInEditor';
import { OpenInIdeButton } from '@/components/ide/OpenInIdeButton';
import { useDiscordOnlineCount } from '@/hooks/useDiscordOnlineCount';

import {
  OrganizationSwitcher,
  SignedIn,
  SignedOut,
  SignInButton,
  SignOutButton,
  UserButton,
} from '@clerk/clerk-react';
import { useTranslation } from 'react-i18next';
import { Switch } from '@/components/ui/switch';

const INTERNAL_NAV = [
  { label: 'Projects', icon: FolderOpen, to: '/projects' },
  { label: 'Settings', icon: Settings, to: '/settings' },
];

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

export function Navbar() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { projectId, project } = useProject();
  const { query, setQuery, active, clear, registerInputRef } = useSearch();
  const handleOpenInEditor = useOpenProjectInEditor(project || null);
  const { data: onlineCount } = useDiscordOnlineCount();
  const navButtonClass = buttonVariants({ variant: 'ghost', size: 'sm' });
  const navButtonTightClass = buttonVariants({
    variant: 'ghost',
    size: 'sm',
    className: 'px-2',
  });

  const setSearchBarRef = useCallback(
    (node: HTMLInputElement | null) => {
      registerInputRef(node);
    },
    [registerInputRef]
  );
  const { t } = useTranslation(['tasks']);
  // Navbar is global, but the share tasks toggle only makes sense on the tasks route
  const isTasksRoute = /^\/projects\/[^/]+\/tasks/.test(location.pathname);
  const showSharedTasks = searchParams.get('shared') !== 'off';

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
      openTaskForm({ projectId });
    }
  };

  const handleOpenInIDE = () => {
    handleOpenInEditor();
  };

  const handleProjectSettings = async () => {
    try {
      await showProjectForm({ project });
      // Settings saved successfully - no additional action needed
    } catch (error) {
      // User cancelled - do nothing
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
            {isTasksRoute && active ? (
              <Switch
                checked={showSharedTasks}
                onCheckedChange={handleSharedToggle}
                aria-label={t('tasks:filters.sharedToggleAria')}
              />
            ) : null}
          </div>

          <div className="flex-1 flex items-center justify-end gap-2">
            <SignedOut>
              <SignInButton mode="modal">
                <button className={navButtonClass}>Sign In</button>
              </SignInButton>
            </SignedOut>

            <SignedIn>
              <div className="flex items-center gap-1">
                <OrganizationSwitcher
                  hidePersonal
                  afterCreateOrganizationUrl="/"
                  afterSelectOrganizationUrl="/"
                  afterLeaveOrganizationUrl="/"
                  appearance={{
                    elements: {
                      organizationSwitcherTrigger: `${navButtonClass} gap-2 text-foreground`,
                      organizationSwitcherTriggerIcon: 'text-muted-foreground',
                      organizationPreviewMainIdentifier: 'text-foreground',
                      organizationPreviewSecondaryIdentifier:
                        'text-muted-foreground',
                    },
                  }}
                />
                <UserButton
                  appearance={{
                    elements: {
                      userButtonTrigger:
                        'rounded-full border border-input hover:bg-accent transition-colors p-0 h-6 w-6',
                      avatarBox: 'h-6 w-6',
                    },
                  }}
                />
                <SignOutButton>
                  <button className={navButtonTightClass}>Sign Out</button>
                </SignOutButton>
              </div>
            </SignedIn>

            {projectId && (
              <>
                <OpenInIdeButton onClick={handleOpenInIDE} />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleProjectSettings}
                  aria-label="Project settings"
                >
                  <Settings className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleCreateTask}
                  aria-label="Create new task"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
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
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </div>
  );
}
