import { createFileRoute } from '@tanstack/react-router';
import { WorkspacesLanding } from '@/pages/ui-new/WorkspacesLanding';

export const Route = createFileRoute('/_app/workspaces')({
  component: WorkspacesLanding,
});
