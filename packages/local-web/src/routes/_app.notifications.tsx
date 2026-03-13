import { createFileRoute } from '@tanstack/react-router';
import { NotificationsPage } from '@/pages/workspaces/NotificationsPage';

export const Route = createFileRoute('/_app/notifications')({
  component: NotificationsPage,
});
