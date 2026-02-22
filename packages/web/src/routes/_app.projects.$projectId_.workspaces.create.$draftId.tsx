import { createFileRoute } from '@tanstack/react-router';
import { ProjectKanban } from '@/pages/ui-new/ProjectKanban';
import { projectSearchValidator } from './-project-search';

export const Route = createFileRoute(
  '/_app/projects/$projectId_/workspaces/create/$draftId'
)({
  validateSearch: projectSearchValidator,
  component: ProjectKanban,
});
