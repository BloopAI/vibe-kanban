import { PlayIcon, SpinnerIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { PrimaryButton } from '../primitives/PrimaryButton';

interface PreviewBrowserProps {
  url?: string;
  onStart: () => void;
  isStarting: boolean;
  hasDevScript: boolean;
  isServerRunning: boolean;
  className?: string;
}

export function PreviewBrowser({
  url,
  onStart,
  isStarting,
  hasDevScript,
  isServerRunning,
  className,
}: PreviewBrowserProps) {
  const { t } = useTranslation(['tasks', 'common']);
  const isLoading = isStarting || (isServerRunning && !url);
  const showIframe = url && !isLoading && isServerRunning;

  return (
    <div
      className={cn(
        'w-full h-full bg-secondary flex flex-col overflow-hidden',
        className
      )}
    >
      {/* Content area */}
      <div className="flex-1 min-h-0 relative">
        {showIframe ? (
          <iframe
            src={url}
            title={t('preview.browser.title')}
            className="w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-base text-low">
            {isLoading ? (
              <>
                <SpinnerIcon className="size-icon-lg animate-spin text-brand" />
                <p className="text-sm">
                  {isStarting
                    ? 'Starting dev server...'
                    : 'Waiting for server...'}
                </p>
              </>
            ) : hasDevScript ? (
              <>
                <p className="text-sm">{t('preview.noServer.title')}</p>
                <PrimaryButton
                  value={t('preview.browser.startButton')}
                  actionIcon={PlayIcon}
                  onClick={onStart}
                  disabled={isStarting}
                />
              </>
            ) : (
              <>
                <p className="text-sm">{t('preview.noDevScript')}</p>
                <p className="text-xs text-lowest">
                  {t('preview.noDevScriptHint')}
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
