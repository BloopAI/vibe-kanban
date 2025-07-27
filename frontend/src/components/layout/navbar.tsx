import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  FolderOpen,
  Settings,
  BookOpen,
  Server,
  MessageCircleQuestion,
} from 'lucide-react';
import { Logo } from '@/components/logo';
import { LanguageSelector } from '@/components/language-selector';
import { useTranslation } from '@/lib/i18n';

export function Navbar() {
  const location = useLocation();
  const { t } = useTranslation();

  return (
    <div className="border-b">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-6">
            <Logo />
            <div className="flex items-center space-x-1">
              <Button
                asChild
                variant={
                  location.pathname === '/projects' ? 'default' : 'ghost'
                }
                size="sm"
              >
                <Link to="/projects">
                  <FolderOpen className="mr-2 h-4 w-4" />
                  {t('nav.projects')}
                </Link>
              </Button>
              <Button
                asChild
                variant={
                  location.pathname === '/mcp-servers' ? 'default' : 'ghost'
                }
                size="sm"
              >
                <Link to="/mcp-servers">
                  <Server className="mr-2 h-4 w-4" />
                  {t('nav.mcpServers')}
                </Link>
              </Button>
              <Button
                asChild
                variant={
                  location.pathname === '/settings' ? 'default' : 'ghost'
                }
                size="sm"
              >
                <Link to="/settings">
                  <Settings className="mr-2 h-4 w-4" />
                  {t('nav.settings')}
                </Link>
              </Button>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <LanguageSelector />
            <Button asChild variant="ghost" size="sm">
              <a
                href="https://vibekanban.com/"
                target="_blank"
                rel="noopener noreferrer"
              >
                <BookOpen className="mr-2 h-4 w-4" />
                {t('nav.docs')}
              </a>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <a
                href="https://github.com/BloopAI/vibe-kanban/issues"
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircleQuestion className="mr-2 h-4 w-4" />
                {t('nav.support')}
              </a>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
