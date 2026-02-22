import { createFileRoute } from '@tanstack/react-router';
import { NewDesignScope } from '@/app/providers/NewDesignScope';
import { RootRedirectPage } from '@/pages/root/RootRedirectPage';

function RootRedirectRouteComponent() {
  return (
    <NewDesignScope>
      <RootRedirectPage />
    </NewDesignScope>
  );
}

export const Route = createFileRoute('/')({
  component: RootRedirectRouteComponent,
});
