import { create } from 'zustand';

export type MobileActivePanel =
  | 'sidebar'
  | 'chat'
  | 'changes'
  | 'logs'
  | 'preview'
  | 'right-sidebar';

interface MobileLayoutState {
  mobileActivePanel: MobileActivePanel;
  setMobileActivePanel: (panel: MobileActivePanel) => void;
}

export const useMobileLayoutStore = create<MobileLayoutState>((set) => ({
  mobileActivePanel: 'chat',
  setMobileActivePanel: (panel) => set({ mobileActivePanel: panel }),
}));
