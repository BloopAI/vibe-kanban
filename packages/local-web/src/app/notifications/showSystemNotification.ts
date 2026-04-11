import { invoke } from '@tauri-apps/api/core';
import { isTauriApp } from '@/shared/lib/platform';

interface NotificationPayload {
  id: string;
  title: string;
  body: string;
  deeplinkPath?: string;
}

export async function showSystemNotification(
  notification: NotificationPayload
): Promise<void> {
  if (!isTauriApp()) {
    return;
  }

  try {
    await invoke('show_system_notification', {
      title: notification.title,
      body: notification.body,
      deeplinkPath: notification.deeplinkPath,
    });
  } catch (error) {
    console.error(
      `Failed to show system notification for group ${notification.id}:`,
      error
    );
  }
}
