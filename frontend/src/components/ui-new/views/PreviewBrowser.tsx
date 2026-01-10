import { PlayIcon, SpinnerIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { PrimaryButton } from '../primitives/PrimaryButton';
import { Repo } from 'shared/types';

interface PreviewBrowserProps {
  url?: string;
  onStart: () => void;
  isStarting: boolean;
  isServerRunning: boolean;
  repos: Repo[];
  handleEditDevScript: () => void;
  className?: string;
}

export function PreviewBrowser({
  url,
  onStart,
  isStarting,
  isServerRunning,
  repos,
  handleEditDevScript,
  className,
}: PreviewBrowserProps) {
  const { t } = useTranslation(['tasks', 'common']);
  const isLoading = isStarting || (isServerRunning && !url);
  const showIframe = url && !isLoading && isServerRunning;

  const hasDevScript = repos.some(
    (repo) => repo.dev_server_script && repo.dev_server_script.trim() !== ''
  );

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
              <div className="flex flex-col gap-double p-double max-w-md">
                <div className="flex flex-col gap-base">
                  <p className="text-xl text-high max-w-xs">
                    You must set up a dev server script to use the preview
                    feature
                  </p>
                  <p>
                    Vibe Kanban can run dev servers to help you test your
                    changes. You can set up a dev server script in the
                    repository section of the settings page.
                  </p>
                </div>
                <div className="flex flex-col gap-base">
                  <div>
                    <PrimaryButton
                      value="Edit Dev Server Script"
                      onClick={handleEditDevScript}
                    />
                  </div>
                  <a
                    href="https://www.vibekanban.com/docs/core-features/testing-your-application"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand hover:text-brand-hover underline"
                  >
                    Learn more about testing applications
                  </a>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
