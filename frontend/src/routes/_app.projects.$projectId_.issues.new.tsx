import { createFileRoute } from '@tanstack/react-router';
import { ProjectKanban } from '@/pages/ui-new/ProjectKanban';
import { projectSearchValidator } from './-project-search';

export const Route = createFileRoute('/_app/projects/$projectId_/issues/new')({
  validateSearch: projectSearchValidator,
  component: ProjectKanban,
});
