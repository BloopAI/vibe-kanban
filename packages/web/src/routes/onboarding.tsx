import { createFileRoute } from '@tanstack/react-router';
import { NewDesignScope } from '@/app/providers/NewDesignScope';
import { LandingPage } from '@/pages/onboarding/LandingPage';

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
