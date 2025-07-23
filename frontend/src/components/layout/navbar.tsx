import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  FolderOpen,
  Settings,
  BookOpen,
  Server,
  MessageCircleQuestion,
  Menu,
  X,
} from 'lucide-react';
import { Logo } from '@/components/logo';
import { useState, useEffect } from 'react';

export function Navbar() {
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navigationItems = [
    {
      path: '/projects',
      label: 'Projects',
      icon: FolderOpen,
    },
    {
      path: '/mcp-servers',
      label: 'MCP Servers',
      icon: Server,
    },
    {
      path: '/settings',
      label: 'Settings',
      icon: Settings,
    },
  ];

  const externalLinks = [
    {
      href: 'https://vibekanban.com/',
      label: 'Docs',
      icon: BookOpen,
    },
    {
      href: 'https://github.com/BloopAI/vibe-kanban/issues',
      label: 'Support',
      icon: MessageCircleQuestion,
    },
  ];

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  // Handle escape key and prevent body scroll when menu is open
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isMobileMenuOpen) {
        closeMobileMenu();
      }
    };

    if (isMobileMenuOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isMobileMenuOpen]);

  return (
    <>
      <div className="border-b">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Left side - Logo and desktop navigation */}
            <div className="flex items-center space-x-6">
              <Logo />

              {/* Desktop navigation - hidden on mobile */}
              <div className="hidden md:flex items-center space-x-1">
                {navigationItems.map((item) => (
                  <Button
                    key={item.path}
                    asChild
                    variant={location.pathname === item.path ? 'default' : 'ghost'}
                    size="sm"
                  >
                    <Link to={item.path}>
                      <item.icon className="mr-2 h-4 w-4" />
                      {item.label}
                    </Link>
                  </Button>
                ))}
              </div>
            </div>

            {/* Right side - External links and mobile menu button */}
            <div className="flex items-center space-x-1">
              {/* Desktop external links - hidden on mobile */}
              <div className="hidden md:flex items-center space-x-1">
                {externalLinks.map((link) => (
                  <Button key={link.href} asChild variant="ghost" size="sm">
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <link.icon className="mr-2 h-4 w-4" />
                      {link.label}
                    </a>
                  </Button>
                ))}
              </div>

              {/* Mobile menu button - visible only on mobile */}
              <Button
                variant="ghost"
                size="sm"
                className="md:hidden"
                onClick={toggleMobileMenu}
                aria-label="Toggle menu"
              >
                {isMobileMenuOpen ? (
                  <X className="h-5 w-5" />
                ) : (
                  <Menu className="h-5 w-5" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile menu overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Mobile navigation menu">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/20 backdrop-blur-sm"
            onClick={closeMobileMenu}
            aria-hidden="true"
          />

          {/* Menu panel */}
          <div className="fixed top-0 right-0 h-full w-64 bg-background border-l shadow-lg">
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b">
                <h2 className="text-lg font-semibold">Menu</h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={closeMobileMenu}
                  aria-label="Close menu"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>

              {/* Navigation items */}
              <div className="flex-1 p-4 space-y-2">
                <div className="space-y-1">
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">
                    Navigation
                  </h3>
                  {navigationItems.map((item) => (
                    <Button
                      key={item.path}
                      asChild
                      variant={location.pathname === item.path ? 'default' : 'ghost'}
                      size="sm"
                      className="w-full justify-start"
                      onClick={closeMobileMenu}
                    >
                      <Link to={item.path}>
                        <item.icon className="mr-2 h-4 w-4" />
                        {item.label}
                      </Link>
                    </Button>
                  ))}
                </div>

                <div className="space-y-1 pt-4">
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">
                    External Links
                  </h3>
                  {externalLinks.map((link) => (
                    <Button
                      key={link.href}
                      asChild
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start"
                      onClick={closeMobileMenu}
                    >
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <link.icon className="mr-2 h-4 w-4" />
                        {link.label}
                      </a>
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
