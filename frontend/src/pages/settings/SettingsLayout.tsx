import { NavLink, Outlet } from 'react-router-dom';
import { Settings, Cpu, Server } from 'lucide-react';
import { cn } from '@/lib/utils';

const settingsNavigation = [
  { 
    path: 'general', 
    label: 'General', 
    icon: Settings,
    description: 'Theme, notifications, and preferences'
  },
  { 
    path: 'executors', 
    label: 'Executors', 
    icon: Cpu,
    description: 'Coding agent configurations'
  },
  { 
    path: 'mcp', 
    label: 'MCP Servers', 
    icon: Server,
    description: 'Model Context Protocol servers'
  },
];

export function SettingsLayout() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex gap-8">
        {/* Sidebar Navigation */}
        <aside className="w-64 shrink-0">
          <div className="space-y-1">
            <h2 className="px-3 py-2 text-lg font-semibold">Settings</h2>
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
                        'flex items-start gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                        'hover:bg-accent hover:text-accent-foreground',
                        isActive
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground'
                      )
                    }
                  >
                    <Icon className="h-4 w-4 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{item.label}</div>
                      <div className={cn(
                        "text-xs mt-0.5",
                        "text-muted-foreground"
                      )}>
                        {item.description}
                      </div>
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
