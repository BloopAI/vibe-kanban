import { createFileRoute } from '@tanstack/react-router';
import { Workspaces } from '@/pages/workspaces/Workspaces';

export const Route = createFileRoute(
  '/_app/hosts/$hostId/workspaces_/$workspaceId'
)({
  component: Workspaces,
});
