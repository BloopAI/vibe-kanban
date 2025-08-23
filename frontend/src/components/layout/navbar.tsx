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
} from 'lucide-react';
import { Logo } from '@/components/logo';

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
  return (
    <div className="border-b">
      <div className="w-full px-3">
        <div className="flex items-center justify-between h-10">
          <Link to="/projects">
            <Logo />
          </Link>

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
              {INTERNAL_NAV.map(item => {
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

              {EXTERNAL_LINKS.map(item => {
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
  );
}
