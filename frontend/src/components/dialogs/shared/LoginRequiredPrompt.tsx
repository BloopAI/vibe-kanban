import { useCallback, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { LogIn, type LucideIcon } from 'lucide-react';
import { useClerk } from '@clerk/clerk-react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type LoginMode = 'signIn' | 'signUp';

interface LoginRequiredPromptProps {
  mode?: LoginMode;
  className?: string;
  buttonVariant?: ComponentProps<typeof Button>['variant'];
  buttonSize?: ComponentProps<typeof Button>['size'];
  buttonClassName?: string;
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: LucideIcon;
}

const getRedirectUrl = () =>
  typeof window !== 'undefined' ? window.location.href : undefined;

export function LoginRequiredPrompt({
  mode = 'signUp',
  className,
  buttonVariant = 'outline',
  buttonSize = 'sm',
  buttonClassName,
  title,
  description,
  actionLabel,
  onAction,
  icon,
}: LoginRequiredPromptProps) {
  const { t } = useTranslation('tasks');
  const { redirectToSignIn, redirectToSignUp } = useClerk();

  const handleRedirect = useCallback(() => {
    if (onAction) {
      onAction();
      return;
    }
    const redirectUrl = getRedirectUrl();
    if (mode === 'signIn') {
      void redirectToSignIn({ redirectUrl });
      return;
    }
    void redirectToSignUp({ redirectUrl });
  }, [mode, onAction, redirectToSignIn, redirectToSignUp]);

  const Icon = icon ?? LogIn;

  return (
    <Alert
      variant="default"
      className={cn('flex items-start gap-3', className)}
    >
      <Icon className="h-5 w-5 mt-0.5 text-muted-foreground" />
      <div className="space-y-2">
        <div className="font-medium">
          {title ?? t('shareDialog.loginRequired.title')}
        </div>
        <p className="text-sm text-muted-foreground">
          {description ?? t('shareDialog.loginRequired.description')}
        </p>
        <Button
          variant={buttonVariant}
          size={buttonSize}
          onClick={handleRedirect}
          className={cn('gap-2', buttonClassName)}
        >
          <Icon className="h-4 w-4" />
          {actionLabel ?? t('shareDialog.loginRequired.action')}
        </Button>
      </div>
    </Alert>
  );
}
