import { createFileRoute } from '@tanstack/react-router';
import { Workspaces } from '@/pages/ui-new/Workspaces';

export const Route = createFileRoute('/_app/workspaces_/$workspaceId')({
  component: Workspaces,
});
