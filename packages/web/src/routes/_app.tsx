import { createFileRoute } from '@tanstack/react-router';
import { NewDesignScope } from '@/app/providers/NewDesignScope';
import { TerminalProvider } from '@/app/providers/TerminalProvider';
import { SharedAppLayout } from '@/components/ui-new/containers/SharedAppLayout';

function AppLayoutRouteComponent() {
  return (
    <NewDesignScope>
      <TerminalProvider>
        <SharedAppLayout />
      </TerminalProvider>
    </NewDesignScope>
  );
}

export const Route = createFileRoute('/_app')({
  component: AppLayoutRouteComponent,
});
