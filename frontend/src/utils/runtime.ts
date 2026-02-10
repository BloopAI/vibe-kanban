type ElectronApi = {
  isElectron?: boolean;
};

type ElectronWindow = Window & {
  electronAPI?: ElectronApi;
};

export function isElectronDesktopApp(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return (window as ElectronWindow).electronAPI?.isElectron === true;
}
