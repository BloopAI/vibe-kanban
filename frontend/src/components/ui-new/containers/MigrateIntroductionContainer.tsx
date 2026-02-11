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

  const handleAction = async () => {
    if (isSignedIn) {
      onContinue();
    } else {
      const profile = await OAuthDialog.show({});
      if (profile) {
        onContinue();
      }
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

  return (
    <MigrateIntroduction isSignedIn={isSignedIn} onAction={handleAction} />
  );
}
