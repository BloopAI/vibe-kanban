// Desktop API for Tauri integration
import { invoke } from '@tauri-apps/api/core';

declare global {
  interface Window {
    __TAURI__?: unknown;
    __TAURI_INVOKE__?: unknown;
    __TAURI_PLUGIN_SHELL__?: unknown;
  }
}

// State to track if we're definitively in a desktop environment
let desktopDetected = false;
let desktopChecked = false;

export const isDesktop = (): boolean => {
  // If we've already definitively detected desktop, return it
  if (desktopChecked && desktopDetected) {
    return true;
  }
  
  // Check multiple indicators for Tauri environment
  const hasWindow = typeof window !== 'undefined';
  const hasTauri = hasWindow && window.__TAURI__ !== undefined;
  const isTauriEnv = hasWindow && (
    window.__TAURI__ !== undefined ||
    // Check for Tauri specific globals
    window.__TAURI_INVOKE__ !== undefined ||
    // Check user agent or other indicators
    navigator.userAgent.includes('Tauri') ||
    // Check if we're in a Tauri context by looking for specific APIs
    typeof window.__TAURI_PLUGIN_SHELL__ !== 'undefined' ||
    // Final fallback - check if we're not in a typical browser environment
    (hasWindow && window.location.protocol === 'tauri:')
  );
  
  // Try to test if Tauri invoke is available
  let canInvoke = false;
  try {
    if (hasWindow && typeof invoke === 'function') {
      canInvoke = true;
    }
  } catch (e) {
    // Ignore errors
  }
  
  const result = isTauriEnv || canInvoke;
  
  // Debug logging (remove in production)
  if (import.meta.env.DEV) {
    console.log('🖥️  Desktop detection:', { 
      hasWindow, 
      hasTauri,
      canInvoke,
      tauriValue: hasWindow ? (window.__TAURI__ ? 'present' : 'missing') : 'no window',
      result: result ? '✅ DESKTOP' : '❌ WEB'
    });
  }
  
  // Cache positive results
  if (result) {
    desktopDetected = true;
    desktopChecked = true;
  }
  
  return result;
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