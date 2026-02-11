import { cn } from '@/lib/utils';
import { GithubLogoIcon, SpinnerIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { GoogleLogo } from './GoogleLogo';

export type OAuthProvider = 'github' | 'google';

interface OAuthSignInButtonProps {
  provider: OAuthProvider;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  loadingText?: string;
  className?: string;
}

const providerConfig = {
  github: {
    i18nKey: 'oauth.continueWithGitHub' as const,
    icon: () => (
      <GithubLogoIcon className="size-[16px] text-[#24292f]" weight="fill" />
    ),
  },
  google: {
    i18nKey: 'oauth.continueWithGoogle' as const,
    icon: () => <GoogleLogo className="size-[18px]" />,
  },
};

export function OAuthSignInButton({
  provider,
  onClick,
  disabled,
  loading,
  loadingText,
  className,
}: OAuthSignInButtonProps) {
  const { t } = useTranslation('common');
  const config = providerConfig[provider];
  const ProviderIcon = config.icon;

  return (
    <button
      type="button"
      className={cn(
        'relative flex h-cta min-w-[260px] items-center gap-half rounded-sm px-base py-half text-cta',
        'border border-[#8E918F] bg-[#131314] text-[#E3E3E3] hover:bg-[#1f1f20]',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand focus-visible:ring-offset-1',
        disabled && 'cursor-not-allowed opacity-60',
        className
      )}
      onClick={onClick}
      disabled={disabled || loading}
    >
      <span className="flex size-6 shrink-0 items-center justify-center rounded-[3px] bg-white">
        {loading ? (
          <SpinnerIcon
            className="size-[14px] animate-spin text-neutral-700"
            weight="bold"
          />
        ) : (
          <ProviderIcon />
        )}
      </span>
      <span className="flex-1 text-center">
        {loading && loadingText ? loadingText : t(config.i18nKey)}
      </span>
    </button>
  );
}
