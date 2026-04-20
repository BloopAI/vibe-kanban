import {
  createFileRoute,
  Outlet,
  useChildMatches,
} from '@tanstack/react-router';
import { ProjectsLanding } from '@/pages/kanban/ProjectsLanding';

function ProjectsRoute() {
  const childMatches = useChildMatches();
  if (childMatches.length > 0) {
    return <Outlet />;
  }
  return <ProjectsLanding />;
}

export const Route = createFileRoute('/_app/projects')({
  component: ProjectsRoute,
});
