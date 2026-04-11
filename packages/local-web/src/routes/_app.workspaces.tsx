import { createFileRoute } from '@tanstack/react-router';
import { WorkspacesLanding } from '@/pages/workspaces/WorkspacesLanding';

export const Route = createFileRoute('/_app/workspaces')({
  component: WorkspacesLanding,
});
