import { useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/auth/useAuth';
import { OAuthDialog } from '@/components/dialogs/global/OAuthDialog';
import { MigrateIntroduction } from '@/components/ui-new/views/MigrateIntroduction';

interface MigrateIntroductionContainerProps {
  onContinue: () => void;
}

export function MigrateIntroductionContainer({
  onContinue,
}: MigrateIntroductionContainerProps) {
  const { isSignedIn, isLoaded } = useAuth();
  const hasAutoAdvancedRef = useRef(false);

  // Auto-advance if user is already signed in
  useEffect(() => {
    if (isLoaded && isSignedIn && !hasAutoAdvancedRef.current) {
      hasAutoAdvancedRef.current = true;
      onContinue();
    }
  }, [isLoaded, isSignedIn, onContinue]);

  const handleSignIn = async () => {
    const profile = await OAuthDialog.show();
    if (profile) {
      onContinue();
    }
  };

  // Show loading while checking auth status
  if (!isLoaded) {
    return (
      <div className="max-w-2xl mx-auto py-double px-base">
        <p className="text-normal">Loading...</p>
      </div>
    );
  }

  // If already signed in, the useEffect will handle advancing
  // But show loading state briefly to avoid flash
  if (isSignedIn) {
    return (
      <div className="max-w-2xl mx-auto py-double px-base">
        <p className="text-normal">Loading...</p>
      </div>
    );
  }

  return <MigrateIntroduction onSignIn={handleSignIn} />;
}
