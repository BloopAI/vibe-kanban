import { createFileRoute } from '@tanstack/react-router';
import { NewDesignScope } from '@/app/providers/NewDesignScope';
import { OnboardingSignInPage } from '@/features/onboarding/ui/OnboardingSignInPage';

function OnboardingSignInRouteComponent() {
  return (
    <NewDesignScope>
      <OnboardingSignInPage />
    </NewDesignScope>
  );
}

export const Route = createFileRoute('/onboarding_/sign-in')({
  component: OnboardingSignInRouteComponent,
});
