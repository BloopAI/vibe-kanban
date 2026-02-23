import { createFileRoute } from '@tanstack/react-router';
import { LocalProjectKanban } from '@/pages/kanban/LocalProjectKanban';
import { projectSearchValidator } from '@vibe/web-core/project-search';

export const Route = createFileRoute('/_app/projects/$projectId')({
  validateSearch: projectSearchValidator,
  component: LocalProjectKanban,
});
