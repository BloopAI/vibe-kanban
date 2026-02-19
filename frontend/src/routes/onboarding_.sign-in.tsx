import { createFileRoute } from '@tanstack/react-router';
import { NewDesignScope } from '@/components/ui-new/scope/NewDesignScope';
import { OnboardingSignInPage } from '@/pages/ui-new/OnboardingSignInPage';

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
