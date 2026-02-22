import { createFileRoute } from '@tanstack/react-router';
import { NewDesignScope } from '@/components/ui-new/scope/NewDesignScope';
import { LandingPage } from '@/pages/ui-new/LandingPage';

function OnboardingLandingRouteComponent() {
  return (
    <NewDesignScope>
      <LandingPage />
    </NewDesignScope>
  );
}

export const Route = createFileRoute('/onboarding')({
  component: OnboardingLandingRouteComponent,
});
