import { create } from "zustand";

interface MobileWorkspaceTitleStore {
  title: string | null;
  setTitle: (title: string | null) => void;
}

export const useMobileWorkspaceTitle = create<MobileWorkspaceTitleStore>(
  (set) => ({
    title: null,
    setTitle: (title) => set({ title }),
  }),
);
