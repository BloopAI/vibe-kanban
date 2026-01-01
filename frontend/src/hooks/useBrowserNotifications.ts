import { useEffect, useRef, useCallback } from 'react';
import { useUserSystem } from '@/components/ConfigProvider';

interface BrowserNotification {
  title: string;
  message: string;
  event: string;
  task_title?: string;
  task_branch?: string;
  executor?: string;
  tool_name?: string;
}

/**
 * Hook that subscribes to SSE events and shows browser notifications
 * when browser_enabled is true in the notification config.
 */
export function useBrowserNotifications() {
  const { config } = useUserSystem();
  const eventSourceRef = useRef<EventSource | null>(null);
  const permissionGrantedRef = useRef<boolean>(false);

  const requestNotificationPermission = useCallback(async () => {
    if (!('Notification' in window)) {
      console.warn('Browser notifications are not supported');
      return false;
    }

    if (Notification.permission === 'granted') {
      permissionGrantedRef.current = true;
      return true;
    }

    if (Notification.permission === 'denied') {
      console.warn('Browser notifications are denied');
      return false;
    }

    // Request permission
    const permission = await Notification.requestPermission();
    permissionGrantedRef.current = permission === 'granted';
    return permissionGrantedRef.current;
  }, []);

  const showNotification = useCallback((notification: BrowserNotification) => {
    if (!permissionGrantedRef.current) {
      return;
    }

    try {
      new Notification(notification.title, {
        body: notification.message,
        icon: '/favicon.ico',
        tag: `vibe-kanban-${notification.event}`,
      });
    } catch (err) {
      console.error('Failed to show browser notification:', err);
    }
  }, []);

  useEffect(() => {
    const browserEnabled = config?.notifications?.browser_enabled ?? false;

    if (!browserEnabled) {
      // Clean up existing connection if browser notifications are disabled
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      return;
    }

    // Request permission when browser notifications are enabled
    requestNotificationPermission();

    // Create SSE connection to listen for notifications
    const eventSource = new EventSource('/api/events');
    eventSourceRef.current = eventSource;

    // Listen for json_patch events (SSE named event type)
    const handleJsonPatch = (event: MessageEvent) => {
      try {
        const patches = JSON.parse(event.data);

        // Look for browser_notification patches
        for (const patch of patches) {
          if (
            patch.path === '/browser_notification' &&
            (patch.op === 'add' || patch.op === 'replace')
          ) {
            const notification = patch.value as BrowserNotification;
            showNotification(notification);
          }
        }
      } catch (err) {
        // Ignore parse errors for non-JSON messages
      }
    };

    eventSource.addEventListener('json_patch', handleJsonPatch);

    eventSource.onerror = () => {
      // SSE will automatically reconnect
      console.debug('SSE connection error, will reconnect');
    };

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [
    config?.notifications?.browser_enabled,
    requestNotificationPermission,
    showNotification,
  ]);
}
