import { createFileRoute } from '@tanstack/react-router';
import { OnboardingSignInPage } from '@/features/onboarding/ui/OnboardingSignInPage';

function OnboardingSignInRouteComponent() {
  return <OnboardingSignInPage />;
}

export const Route = createFileRoute('/onboarding_/sign-in')({
  component: OnboardingSignInRouteComponent,
});
