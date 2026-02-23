import { createFileRoute } from '@tanstack/react-router';
import { RootRedirectPage } from '@/pages/root/RootRedirectPage';

function RootRedirectRouteComponent() {
  return <RootRedirectPage />;
}

export const Route = createFileRoute('/')({
  component: RootRedirectRouteComponent,
});
