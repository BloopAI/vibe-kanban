import { createFileRoute } from '@tanstack/react-router';
import { NewDesignScope } from '@/components/ui-new/scope/NewDesignScope';
import { RootRedirectPage } from '@/pages/ui-new/RootRedirectPage';

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
