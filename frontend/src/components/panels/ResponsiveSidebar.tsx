import React from 'react';
import {
  getBackdropClasses,
  getTaskPanelClasses,
  getTaskPanelInnerClasses,
} from '@/lib/responsive-config';

export interface ResponsiveSidebarProps {
  children: React.ReactNode;
}

/**
 * Pure layout shell for the task panel:
 * - Always shows a backdrop (no click handler).
 * - Always uses the non-fullscreen responsive classes.
 */
export function ResponsiveSidebar({ children }: ResponsiveSidebarProps) {
  return (
    <>
      <div
        className={getBackdropClasses(false)}
        aria-hidden="true"
        data-testid="kanban-responsive-backdrop"
      />
      <div
        className={getTaskPanelClasses(false)}
        role="dialog"
        aria-modal
        data-testid="kanban-responsive-panel"
      >
        <div className={getTaskPanelInnerClasses()}>{children}</div>
      </div>
    </>
  );
}

export default ResponsiveSidebar;
