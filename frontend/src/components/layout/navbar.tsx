import { Link, useLocation } from 'react-router-dom';
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
  Server,
  MessageCircleQuestion,
  Menu,
  Plus,
} from 'lucide-react';
import { Logo } from '@/components/logo';
import { SearchBar } from '@/components/search-bar';
import { useSearch } from '@/contexts/search-context';
import { useTaskDialog } from '@/contexts/task-dialog-context';
import { useProject } from '@/contexts/project-context';
import { projectsApi } from '@/lib/api';

const INTERNAL_NAV = [
  { label: 'Projects', icon: FolderOpen, to: '/projects' },
  { label: 'MCP Servers', icon: Server, to: '/mcp-servers' },
  { label: 'Settings', icon: Settings, to: '/settings' },
];

const EXTERNAL_LINKS = [
  {
    label: 'Docs',
    icon: BookOpen,
    href: 'https://vibekanban.com/',
  },
  {
    label: 'Support',
    icon: MessageCircleQuestion,
    href: 'https://github.com/BloopAI/vibe-kanban/issues',
  },
];

export function Navbar() {
  const location = useLocation();
  const { projectId, project } = useProject();
  const { query, setQuery, active, clear } = useSearch();
  const { openCreate } = useTaskDialog();

  const handleOpenInIDE = async () => {
    if (!projectId) return;
    try {
      await projectsApi.openEditor(projectId);
    } catch (err) {
      console.error('Failed to open project in IDE:', err);
    }
  };

  return (
    <div className="border-b bg-background">
      <div className="w-full px-3">
        <div className="flex items-center h-12 py-2">
          <div className="flex-1">
            <Link to="/projects">
              <Logo />
            </Link>
          </div>

          <SearchBar
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
                  onClick={() => openCreate()}
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
                  const active = location.pathname === item.to;
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
