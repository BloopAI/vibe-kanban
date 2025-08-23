/**
 * Centralized responsive configuration for TaskDetailsPanel
 * Adjust these values to change when the panel switches between overlay and side-by-side modes
 */

// The breakpoint at which we switch from overlay to side-by-side mode
// Change this value to adjust when the panel switches to side-by-side mode:
// 'sm' = 640px, 'md' = 768px, 'lg' = 1024px, 'xl' = 1280px, '2xl' = 1536px
export const PANEL_SIDE_BY_SIDE_BREAKPOINT = 'xl' as const;

// Panel widths for different screen sizes (in overlay mode)
export const PANEL_WIDTHS = {
  base: 'w-full', // < 640px
  sm: 'sm:w-[560px]', // 640px+
  md: 'md:w-[600px]', // 768px+
  lg: 'lg:w-[650px]', // 1024px+ (smaller to start transitioning)
  xl: 'xl:w-[750px]', // 1280px+
  '2xl': '2xl:w-[800px]', // 1536px+ (side-by-side mode)
} as const;

// Generate classes for TaskDetailsPanel
export const getTaskPanelClasses = (forceFullScreen: boolean) => {
  const overlayClasses = forceFullScreen
    ? 'fixed inset-y-0 right-0 z-50 w-full'
    : [
        'fixed inset-y-0 right-0 z-50',
        PANEL_WIDTHS.base,
        PANEL_WIDTHS.sm,
        PANEL_WIDTHS.md,
        PANEL_WIDTHS.lg,
        PANEL_WIDTHS.xl,
      ].join(' ');

  const sideBySideClasses = forceFullScreen
    ? ''
    : [
        `${PANEL_SIDE_BY_SIDE_BREAKPOINT}:relative`,
        `${PANEL_SIDE_BY_SIDE_BREAKPOINT}:inset-auto`,
        `${PANEL_SIDE_BY_SIDE_BREAKPOINT}:z-auto`,
        `${PANEL_SIDE_BY_SIDE_BREAKPOINT}:h-full`,
        `${PANEL_SIDE_BY_SIDE_BREAKPOINT}:w-[800px]`,
      ].join(' ');

  return `${overlayClasses} ${sideBySideClasses} bg-background border-l shadow-lg overflow-hidden`;
};

// Generate classes for backdrop (only show in overlay mode)
export const getBackdropClasses = (forceFullScreen: boolean) => {
  return `fixed inset-0 z-40 bg-background/80 backdrop-blur-sm ${PANEL_SIDE_BY_SIDE_BREAKPOINT}:hidden ${forceFullScreen ? '' : 'hidden'}`;
};

// Generate classes for main container (enable flex layout in side-by-side mode)
export const getMainContainerClasses = (
  isPanelOpen: boolean,
  forceFullScreen: boolean
) => {
  const overlayClasses =
    isPanelOpen && forceFullScreen
      ? 'w-full'
      : `${PANEL_SIDE_BY_SIDE_BREAKPOINT}:flex ${PANEL_SIDE_BY_SIDE_BREAKPOINT}:h-full`;

  return `${overlayClasses}`;
};

// Generate classes for kanban section
export const getKanbanSectionClasses = (
  isPanelOpen: boolean,
  forceFullScreen: boolean
) => {
  if (!isPanelOpen) return 'w-full';

  // const overlayClasses = 'w-full opacity-50 pointer-events-none';
  const sideBySideClasses =
    isPanelOpen && forceFullScreen
      ? ''
      : [
          `${PANEL_SIDE_BY_SIDE_BREAKPOINT}:flex-1`,
          `${PANEL_SIDE_BY_SIDE_BREAKPOINT}:min-w-0`,
          `${PANEL_SIDE_BY_SIDE_BREAKPOINT}:h-full`,
          `${PANEL_SIDE_BY_SIDE_BREAKPOINT}:overflow-y-auto`,
          `${PANEL_SIDE_BY_SIDE_BREAKPOINT}:opacity-100`,
          `${PANEL_SIDE_BY_SIDE_BREAKPOINT}:pointer-events-auto`,
        ].join(' ');

  // return `${overlayClasses} ${sideBySideClasses}`;
  return `${sideBySideClasses}`;
};
