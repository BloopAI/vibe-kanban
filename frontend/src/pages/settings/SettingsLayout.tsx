import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Settings, Cpu, Server, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { usePreviousPath } from '@/hooks/usePreviousPath';

const settingsNavigation = [
  {
    path: 'general',
    icon: Settings,
  },
  {
    path: 'agents',
    icon: Cpu,
  },
  {
    path: 'mcp',
    icon: Server,
  },
];

export function SettingsLayout() {
  const { t } = useTranslation('settings');
  const goToPreviousPath = usePreviousPath();

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar Navigation */}
        <aside className="w-full lg:w-64 lg:shrink-0 lg:sticky lg:top-8 lg:h-fit lg:max-h-[calc(100vh-4rem)] lg:overflow-y-auto">
          <div className="space-y-1">
            <Button variant="ghost" onClick={goToPreviousPath} className="mb-4">
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t('settings.layout.nav.backToApp')}
            </Button>
            <h2 className="px-3 py-2 text-lg font-semibold">
              {t('settings.layout.nav.title')}
            </h2>
            <nav className="space-y-1">
              {settingsNavigation.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end
                    className={({ isActive }) =>
                      cn(
                        'flex items-start gap-3 px-3 py-2 text-sm transition-colors',
                        'hover:text-accent-foreground',
                        isActive
                          ? 'text-primary-foreground'
                          : 'text-secondary-foreground'
                      )
                    }
                  >
                    <Icon className="h-4 w-4 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">
                        {t(`settings.layout.nav.${item.path}`)}
                      </div>
                      <div>{t(`settings.layout.nav.${item.path}Desc`)}</div>
                    </div>
                  </NavLink>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
