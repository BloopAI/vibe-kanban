// Desktop API for Tauri integration
import { invoke } from '@tauri-apps/api/core';

declare global {
  interface Window {
    __TAURI__?: unknown;
  }
}

export const isDesktop = (): boolean => {
  return typeof window !== 'undefined' && window.__TAURI__ !== undefined;
};

export const desktopAPI = {
  // Backend integration
  startBackendServer: async (): Promise<string> => {
    if (!isDesktop()) return 'Backend not available in web mode';
    return await invoke('start_backend_server');
  },

  getBackendUrl: async (): Promise<string> => {
    if (!isDesktop()) return window.location.origin;
    return await invoke('get_backend_url');
  },

  // Notifications
  showNotification: async (title: string, body: string): Promise<void> => {
    if (!isDesktop()) {
      // Fallback to browser notifications
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body });
      }
      return;
    }
    await invoke('show_notification', { title, body });
  },

  // Window management
  minimizeToTray: async (): Promise<void> => {
    if (!isDesktop()) return;
    await invoke('minimize_to_tray');
  },

  restoreFromTray: async (): Promise<void> => {
    if (!isDesktop()) return;
    await invoke('restore_from_tray');
  },

  // Request notification permission (for web fallback)
  requestNotificationPermission: async (): Promise<boolean> => {
    if (isDesktop()) return true; // Desktop notifications don't need permission
    
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }
    return false;
  }
};

// Initialize desktop features on load
export const initializeDesktop = async () => {
  if (!isDesktop()) return;
  
  try {
    // Start backend server
    console.log('Starting embedded backend server...');
    const result = await desktopAPI.startBackendServer();
    console.log(result);
    
    // Request notification permission as fallback
    await desktopAPI.requestNotificationPermission();
    
    console.log('Desktop features initialized');
  } catch (error) {
    console.error('Failed to initialize desktop features:', error);
  }
};

export default desktopAPI;