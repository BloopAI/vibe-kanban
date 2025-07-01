import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { FolderOpen, Settings, HelpCircle, Server } from 'lucide-react';
import { Logo } from '@/components/logo';
import { SupportDialog } from '@/components/support-dialog';

export function Navbar() {
  const location = useLocation();

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
                  Projects
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
                  MCP Servers
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
                  Settings
                </Link>
              </Button>
            </div>
          </div>
          <div className="flex items-center">
            <SupportDialog>
              <Button variant="ghost" size="sm">
                <HelpCircle className="mr-2 h-4 w-4" />
                Support
              </Button>
            </SupportDialog>
          </div>
        </div>
      </div>
    </div>
  );
}
