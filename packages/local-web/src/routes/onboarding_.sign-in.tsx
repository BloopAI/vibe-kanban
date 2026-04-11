import { createFileRoute } from '@tanstack/react-router';
import { Provider as NiceModalProvider } from '@ebay/nice-modal-react';
import { OnboardingSignInPage } from '@/features/onboarding/ui/OnboardingSignInPage';

function OnboardingSignInRouteComponent() {
  return (
    <NiceModalProvider>
      <OnboardingSignInPage />
    </NiceModalProvider>
  );
}

export const Route = createFileRoute('/onboarding_/sign-in')({
  component: OnboardingSignInRouteComponent,
});
