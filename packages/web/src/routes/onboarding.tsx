import { createFileRoute } from '@tanstack/react-router';
import { LandingPage } from '@/features/onboarding/ui/LandingPage';

function OnboardingLandingRouteComponent() {
  return <LandingPage />;
}

export const Route = createFileRoute('/onboarding')({
  component: OnboardingLandingRouteComponent,
});
