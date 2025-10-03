import { Link, useLocation } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
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

const DISCORD_GUILD_ID = '1423630976524877857';

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
  const { projectId, project } = useProject();
  const { query, setQuery, active, clear, registerInputRef } = useSearch();
  const handleOpenInEditor = useOpenProjectInEditor(project || null);
  const [onlineCount, setOnlineCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchCount = async () => {
      try {
        const res = await fetch(
          `https://discord.com/api/guilds/${DISCORD_GUILD_ID}/widget.json`,
          { cache: 'no-store' }
        );
        if (!res.ok) return; // Widget disabled or temporary error; keep previous value
        const data = await res.json();
        if (!cancelled && typeof data?.presence_count === 'number') {
          setOnlineCount(data.presence_count);
        }
      } catch {
        // Network error; ignore and keep previous value
      }
    };

    // Initial fetch + refresh every 60s
    fetchCount();
    const interval = setInterval(fetchCount, 60_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const setSearchBarRef = useCallback(
    (node: HTMLInputElement | null) => {
      registerInputRef(node);
    },
    [registerInputRef]
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
                {onlineCount !== null
                  ? `${onlineCount.toLocaleString()} online`
                  : 'online'}
              </span>
            </a>
          </div>

          <SearchBar
            ref={setSearchBarRef}
            className="hidden sm:flex"
            value={query}
            onChange={setQuery}
            disabled={!active}
            onClear={clear}
            project={project || null}
          />

          <div className="flex-1 flex justify-end">
            {projectId && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleOpenInIDE}
                  aria-label="Open project in IDE"
                >
                  <FolderOpen className="h-4 w-4" />
                </Button>
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
