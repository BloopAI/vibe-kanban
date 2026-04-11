import { create } from 'zustand';

type State = {
  /** Non-null when a new version has been downloaded and is ready to install. */
  updateVersion: string | null;
  /** Callback to restart the app. Set by the platform-specific hook. */
  restart: (() => void) | null;
  setUpdate: (version: string, restart: () => void) => void;
};

export const useAppUpdateStore = create<State>()((set) => ({
  updateVersion: null,
  restart: null,
  setUpdate: (version, restart) => set({ updateVersion: version, restart }),
}));
