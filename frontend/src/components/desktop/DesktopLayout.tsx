import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { DesktopSidebar, DesktopSidebarItem, DesktopSidebarSection } from './DesktopSidebar';
import { DesktopCard } from './DesktopCard';
import { DesktopButton } from './DesktopButton';
import { DesktopInput } from './DesktopInput';
import { useDesktopDetection } from '@/hooks/useDesktopDetection';

interface DesktopLayoutProps {
  children: React.ReactNode;
}

export const DesktopLayout: React.FC<DesktopLayoutProps> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isDesktopEnv } = useDesktopDetection();
  
  // Debug logging (development only)
  if (import.meta.env.DEV) {
    console.log('🎨 DesktopLayout render - isDesktopEnv:', isDesktopEnv);
  }
  
  if (!isDesktopEnv) {
    return <>{children}</>;
  }
  
  const navigationItems = [
    {
      path: '/projects',
      label: 'Projects',
      icon: (
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      )
    },
    {
      path: '/integrations',
      label: 'Integrations',
      icon: (
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
      )
    },
    {
      path: '/mcp-servers',
      label: 'MCP Servers',
      icon: (
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
        </svg>
      )
    },
    {
      path: '/settings',
      label: 'Settings',
      icon: (
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      )
    }
  ];
  
  const isActive = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };
  
  return (
    <div className="h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/50 flex overflow-hidden">
      {/* Sidebar */}
      <div className="flex-shrink-0 p-4">
        <DesktopSidebar>
          {/* App Header */}
          <div className="px-3 py-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-800">Vibe Kanban</h1>
                <p className="text-xs text-slate-500">Task Management</p>
              </div>
            </div>
          </div>
          
          {/* Quick Search */}
          <div className="px-3 mb-6">
            <DesktopInput 
              placeholder="Search tasks, projects..."
              variant="search"
              icon={(
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              )}
            />
          </div>
          
          {/* Navigation */}
          <DesktopSidebarSection title="Navigation">
            {navigationItems.map((item) => (
              <DesktopSidebarItem
                key={item.path}
                icon={item.icon}
                label={item.label}
                active={isActive(item.path)}
                onClick={() => navigate(item.path)}
              />
            ))}
          </DesktopSidebarSection>
          
          {/* Quick Actions */}
          <DesktopSidebarSection title="Quick Actions">
            <DesktopSidebarItem
              icon={(
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              )}
              label="New Project"
              onClick={() => {/* Handle new project */}}
            />
            <DesktopSidebarItem
              icon={(
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              )}
              label="New Task"
              onClick={() => {/* Handle new task */}}
            />
          </DesktopSidebarSection>
        </DesktopSidebar>
      </div>
      
      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Title Bar */}
        <div className="flex-shrink-0 p-4 pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <DesktopButton
                variant="ghost"
                size="icon"
                onClick={() => window.history.back()}
                disabled={!window.history.state}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </DesktopButton>
              <DesktopButton
                variant="ghost"
                size="icon"
                onClick={() => window.history.forward()}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </DesktopButton>
            </div>
            
            <div className="flex items-center gap-2">
              <DesktopButton variant="ghost" size="sm">
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </DesktopButton>
            </div>
          </div>
        </div>
        
        {/* Content Area */}
        <div className="flex-1 px-4 pb-4">
          <DesktopCard variant="default" padding="none" className="h-full">
            <div className="h-full overflow-y-auto">
              {children}
            </div>
          </DesktopCard>
        </div>
      </div>
    </div>
  );
};
