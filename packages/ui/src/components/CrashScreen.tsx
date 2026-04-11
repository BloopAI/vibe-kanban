import { useState } from 'react';
import { WarningIcon, ArrowClockwiseIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';

export interface CrashScreenProps {
  error?: Error | string;
  componentStack?: string | null;
  onReload?: () => void;
}

export function CrashScreen({
  error,
  componentStack,
  onReload,
}: CrashScreenProps) {
  const { t } = useTranslation('common');
  const [showDetails, setShowDetails] = useState(false);

  const errorMessage =
    error instanceof Error ? error.message : (error ?? undefined);
  const hasDetails = !!(errorMessage || componentStack);

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-primary p-double font-ibm-plex-sans">
      <div className="flex max-w-md flex-col items-center gap-double text-center">
        <WarningIcon className="size-12 text-error" weight="fill" />

        <div className="flex flex-col gap-half">
          <h1 className="text-xl font-semibold text-high">
            {t('crashScreen.title')}
          </h1>
          <p className="text-base text-low">{t('crashScreen.description')}</p>
        </div>

        <button
          type="button"
          onClick={() => (onReload ?? (() => window.location.reload()))()}
          className="flex items-center gap-half rounded-md bg-brand px-double py-base text-base font-medium text-white hover:bg-brand/90 transition-colors"
        >
          <ArrowClockwiseIcon className="size-icon-base" weight="bold" />
          {t('crashScreen.reload')}
        </button>

        {hasDetails && (
          <div className="w-full">
            <button
              type="button"
              onClick={() => setShowDetails((v) => !v)}
              className="text-sm text-low hover:text-normal transition-colors"
            >
              {showDetails
                ? t('crashScreen.hideDetails')
                : t('crashScreen.showDetails')}
            </button>

            {showDetails && (
              <pre className="mt-half max-h-48 w-full overflow-auto rounded-sm bg-secondary p-base text-left text-xs text-low">
                {errorMessage}
                {componentStack && `\n\nComponent stack:${componentStack}`}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
