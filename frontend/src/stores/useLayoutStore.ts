import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type LayoutState = {
  // Panel visibility
  isSidebarVisible: boolean;
  isMainPanelVisible: boolean;
  isGitPanelVisible: boolean;
  isChangesMode: boolean;
  isLogsMode: boolean;
  isPreviewMode: boolean;

  // Preview refresh coordination
  previewRefreshKey: number;

  // Toggle functions
  toggleSidebar: () => void;
  toggleMainPanel: () => void;
  toggleGitPanel: () => void;
  toggleChangesMode: () => void;
  toggleLogsMode: () => void;
  togglePreviewMode: () => void;

  // Setters for direct state updates
  setChangesMode: (value: boolean) => void;
  setLogsMode: (value: boolean) => void;
  setPreviewMode: (value: boolean) => void;
  setSidebarVisible: (value: boolean) => void;

  // Preview actions
  triggerPreviewRefresh: () => void;

  // Reset for create mode
  resetForCreateMode: () => void;
};

// Check if screen is wide enough to keep sidebar visible
const isWideScreen = () => window.innerWidth > 2048;

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set, get) => ({
      isSidebarVisible: true,
      isMainPanelVisible: true,
      isGitPanelVisible: true,
      isChangesMode: false,
      isLogsMode: false,
      isPreviewMode: false,
      previewRefreshKey: 0,

      toggleSidebar: () =>
        set((s) => ({ isSidebarVisible: !s.isSidebarVisible })),

      toggleMainPanel: () => {
        const { isMainPanelVisible, isChangesMode } = get();
        // At least one of Main or Changes must be visible
        if (isMainPanelVisible && !isChangesMode) return;
        set({ isMainPanelVisible: !isMainPanelVisible });
      },

      toggleGitPanel: () =>
        set((s) => ({ isGitPanelVisible: !s.isGitPanelVisible })),

      toggleChangesMode: () => {
        const { isChangesMode } = get();
        const newChangesMode = !isChangesMode;

        if (newChangesMode) {
          // Changes, logs, and preview are mutually exclusive
          // Auto-hide sidebar when entering changes mode (unless screen is wide enough)
          set({
            isChangesMode: true,
            isLogsMode: false,
            isPreviewMode: false,
            isSidebarVisible: isWideScreen() ? get().isSidebarVisible : false,
          });
        } else {
          // Auto-show sidebar when exiting changes mode
          set({
            isChangesMode: false,
            isSidebarVisible: true,
          });
        }
      },

      toggleLogsMode: () => {
        const { isLogsMode } = get();
        const newLogsMode = !isLogsMode;

        if (newLogsMode) {
          // Logs, changes, and preview are mutually exclusive
          // Auto-hide sidebar when entering logs mode (unless screen is wide enough)
          set({
            isLogsMode: true,
            isChangesMode: false,
            isPreviewMode: false,
            isSidebarVisible: isWideScreen() ? get().isSidebarVisible : false,
          });
        } else {
          // Auto-show sidebar when exiting logs mode
          set({
            isLogsMode: false,
            isSidebarVisible: true,
          });
        }
      },

      togglePreviewMode: () => {
        const { isPreviewMode } = get();
        const newPreviewMode = !isPreviewMode;

        if (newPreviewMode) {
          // Preview, changes, and logs are mutually exclusive
          // Auto-hide sidebar when entering preview mode (unless screen is wide enough)
          set({
            isPreviewMode: true,
            isChangesMode: false,
            isLogsMode: false,
            isSidebarVisible: isWideScreen() ? get().isSidebarVisible : false,
          });
        } else {
          // Auto-show sidebar when exiting preview mode
          set({
            isPreviewMode: false,
            isSidebarVisible: true,
          });
        }
      },

      setChangesMode: (value) => {
        if (value) {
          set({
            isChangesMode: true,
            isLogsMode: false,
            isPreviewMode: false,
            isSidebarVisible: isWideScreen() ? get().isSidebarVisible : false,
          });
        } else {
          set({ isChangesMode: false });
        }
      },

      setLogsMode: (value) => {
        if (value) {
          set({
            isLogsMode: true,
            isChangesMode: false,
            isPreviewMode: false,
            isSidebarVisible: isWideScreen() ? get().isSidebarVisible : false,
          });
        } else {
          set({ isLogsMode: false });
        }
      },

      setPreviewMode: (value) => {
        if (value) {
          set({
            isPreviewMode: true,
            isChangesMode: false,
            isLogsMode: false,
            isSidebarVisible: isWideScreen() ? get().isSidebarVisible : false,
          });
        } else {
          set({ isPreviewMode: false });
        }
      },

      setSidebarVisible: (value) => set({ isSidebarVisible: value }),

      triggerPreviewRefresh: () =>
        set((s) => ({ previewRefreshKey: s.previewRefreshKey + 1 })),

      resetForCreateMode: () =>
        set({
          isChangesMode: false,
          isLogsMode: false,
          isPreviewMode: false,
        }),
    }),
    {
      name: 'layout-preferences',
      // Only persist panel visibility preferences, not mode states
      partialize: (state) => ({
        isSidebarVisible: state.isSidebarVisible,
        isMainPanelVisible: state.isMainPanelVisible,
        isGitPanelVisible: state.isGitPanelVisible,
      }),
    }
  )
);

// Convenience hooks for individual state values
export const useIsSidebarVisible = () =>
  useLayoutStore((s) => s.isSidebarVisible);
export const useIsMainPanelVisible = () =>
  useLayoutStore((s) => s.isMainPanelVisible);
export const useIsGitPanelVisible = () =>
  useLayoutStore((s) => s.isGitPanelVisible);
export const useIsChangesMode = () => useLayoutStore((s) => s.isChangesMode);
export const useIsLogsMode = () => useLayoutStore((s) => s.isLogsMode);
export const useIsPreviewMode = () => useLayoutStore((s) => s.isPreviewMode);
