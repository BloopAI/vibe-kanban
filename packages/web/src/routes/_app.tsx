import { createFileRoute } from '@tanstack/react-router';
import { NewDesignScope } from '@/components/ui-new/scope/NewDesignScope';
import { TerminalProvider } from '@/contexts/TerminalContext';
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
