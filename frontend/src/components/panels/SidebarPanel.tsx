import React from 'react';

export interface SidebarPanelProps {
  children: React.ReactNode;
}

export function SidebarPanel({ children }: SidebarPanelProps) {
  return (
    <aside
      className="h-full w-full max-w-[800px] flex flex-col bg-diagonal-lines shadow-lg"
      role="dialog"
      aria-modal
      data-testid="kanban-sidebar-panel"
    >
      <div className="flex-1 min-h-0 overflow-auto bg-muted border-x">
        {children}
      </div>
    </aside>
  );
}

export default SidebarPanel;
