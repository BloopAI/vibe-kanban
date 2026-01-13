import type { RefObject } from 'react';
import {
  PlayIcon,
  SpinnerIcon,
  WrenchIcon,
  ArrowSquareOutIcon,
  ArrowClockwiseIcon,
  CopyIcon,
  XIcon,
  MonitorIcon,
  DeviceMobileIcon,
  ArrowsOutCardinalIcon,
  PauseIcon,
} from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { PrimaryButton } from '../primitives/PrimaryButton';
import {
  IconButtonGroup,
  IconButtonGroupItem,
} from '../primitives/IconButtonGroup';
import type { Repo } from 'shared/types';
import type {
  ScreenSize,
  ResponsiveDimensions,
} from '@/hooks/usePreviewSettings';

const MOBILE_WIDTH = 390;
const MOBILE_HEIGHT = 844;

interface PreviewBrowserProps {
  url?: string;
  autoDetectedUrl?: string;
  urlInputValue: string;
  urlInputRef: RefObject<HTMLInputElement>;
  isUsingOverride?: boolean;
  onUrlInputChange: (value: string) => void;
  onClearOverride?: () => void;
  onCopyUrl: () => void;
  onOpenInNewTab: () => void;
  onRefresh: () => void;
  onStart: () => void;
  onStop: () => void;
  isStarting: boolean;
  isStopping: boolean;
  isServerRunning: boolean;
  screenSize: ScreenSize;
  localDimensions: ResponsiveDimensions;
  onScreenSizeChange: (size: ScreenSize) => void;
  onResizeStart: (
    direction: 'right' | 'bottom' | 'corner'
  ) => (e: React.MouseEvent | React.TouchEvent) => void;
  isResizing: boolean;
  containerRef: RefObject<HTMLDivElement>;
  repos: Repo[];
  handleEditDevScript: () => void;
  handleFixDevScript?: () => void;
  className?: string;
}

export function PreviewBrowser({
  url,
  autoDetectedUrl,
  urlInputValue,
  urlInputRef,
  isUsingOverride,
  onUrlInputChange,
  onClearOverride,
  onCopyUrl,
  onOpenInNewTab,
  onRefresh,
  onStart,
  onStop,
  isStarting,
  isStopping,
  isServerRunning,
  screenSize,
  localDimensions,
  onScreenSizeChange,
  onResizeStart,
  isResizing,
  containerRef,
  repos,
  handleEditDevScript,
  handleFixDevScript,
  className,
}: PreviewBrowserProps) {
  const { t } = useTranslation(['tasks', 'common']);
  const isLoading = isStarting || (isServerRunning && !url);
  const showIframe = url && !isLoading && isServerRunning;
  const hasUrl = !!(url || autoDetectedUrl);

  const hasDevScript = repos.some(
    (repo) => repo.dev_server_script && repo.dev_server_script.trim() !== ''
  );

  const getIframeContainerStyle = (): React.CSSProperties => {
    switch (screenSize) {
      case 'mobile':
        return {
          width: MOBILE_WIDTH,
          height: MOBILE_HEIGHT,
        };
      case 'responsive':
        return {
          width: localDimensions.width,
          height: localDimensions.height,
        };
      case 'desktop':
      default:
        return {
          width: '100%',
          height: '100%',
        };
    }
  };

  return (
    <div
      className={cn(
        'bg-brand/20 w-full h-full flex flex-col overflow-hidden',
        className
      )}
    >
      {/* Floating Toolbar */}
      <div className="p-double">
        <div className="backdrop-blur-sm bg-panel/80 border border-brand/20 flex items-center gap-base p-base rounded-md shadow-md shrink-0">
          {/* URL Input */}
          <div
            className={cn(
              'flex items-center gap-half rounded-sm px-base py-half flex-1 min-w-0',
              !hasUrl && 'opacity-50'
            )}
          >
            <input
              ref={urlInputRef}
              type="text"
              value={urlInputValue}
              onChange={(e) => onUrlInputChange(e.target.value)}
              placeholder={autoDetectedUrl ?? 'Enter URL...'}
              disabled={!hasUrl}
              className={cn(
                'flex-1 font-mono text-sm bg-transparent border-none outline-none min-w-0',
                isUsingOverride
                  ? 'text-normal'
                  : 'text-low placeholder:text-low',
                !hasUrl && 'cursor-not-allowed'
              )}
            />
          </div>

          {/* URL Actions */}
          <IconButtonGroup>
            {isUsingOverride && (
              <IconButtonGroupItem
                icon={XIcon}
                onClick={onClearOverride}
                aria-label="Clear URL override"
                title="Revert to auto-detected URL"
              />
            )}
            <IconButtonGroupItem
              icon={CopyIcon}
              onClick={onCopyUrl}
              disabled={!hasUrl}
              aria-label="Copy URL"
              title="Copy URL"
            />
            <IconButtonGroupItem
              icon={ArrowSquareOutIcon}
              onClick={onOpenInNewTab}
              disabled={!hasUrl}
              aria-label="Open in new tab"
              title="Open in new tab"
            />
            <IconButtonGroupItem
              icon={ArrowClockwiseIcon}
              onClick={onRefresh}
              disabled={!hasUrl}
              aria-label="Refresh"
              title="Refresh preview"
            />
          </IconButtonGroup>

          {/* Screen Size Toggle */}
          <IconButtonGroup>
            <IconButtonGroupItem
              icon={MonitorIcon}
              onClick={() => onScreenSizeChange('desktop')}
              active={screenSize === 'desktop'}
              aria-label="Desktop view"
              title="Desktop view"
            />
            <IconButtonGroupItem
              icon={DeviceMobileIcon}
              onClick={() => onScreenSizeChange('mobile')}
              active={screenSize === 'mobile'}
              aria-label="Mobile view (390x844)"
              title="Mobile view (390x844)"
            />
            <IconButtonGroupItem
              icon={ArrowsOutCardinalIcon}
              onClick={() => onScreenSizeChange('responsive')}
              active={screenSize === 'responsive'}
              aria-label="Responsive view (resizable)"
              title="Responsive view (resizable)"
            />
          </IconButtonGroup>

          {/* Dimensions display for responsive mode */}
          {screenSize === 'responsive' && (
            <span className="text-xs text-low font-mono whitespace-nowrap">
              {Math.round(localDimensions.width)} x{' '}
              {Math.round(localDimensions.height)}
            </span>
          )}

          {/* Start/Stop Button */}
          <IconButtonGroup>
            <IconButtonGroupItem
              icon={
                isServerRunning
                  ? isStopping
                    ? SpinnerIcon
                    : PauseIcon
                  : isStarting
                    ? SpinnerIcon
                    : PlayIcon
              }
              iconClassName={isStopping || isStarting ? 'animate-spin' : undefined}
              onClick={isServerRunning ? onStop : onStart}
              disabled={
                isServerRunning ? isStopping : isStarting || !hasDevScript
              }
              aria-label={isServerRunning ? 'Stop server' : 'Start dev server'}
              title={isServerRunning ? 'Stop dev server' : 'Start dev server'}
            />
          </IconButtonGroup>
        </div>
      </div>

      {/* Content area */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 relative overflow-auto px-double pb-double"
      >
        {showIframe ? (
          <div
            className={cn(
              'h-full',
              screenSize === 'desktop'
                ? ''
                : 'flex items-center justify-center p-double'
            )}
          >
            {screenSize === 'mobile' ? (
              // Phone frame for mobile mode
              <div className="bg-primary rounded-[2rem] p-3 shadow-xl">
                <div
                  className="rounded-[1.5rem] overflow-hidden"
                  style={{ width: MOBILE_WIDTH, height: MOBILE_HEIGHT }}
                >
                  <iframe
                    src={url}
                    title={t('preview.browser.title')}
                    className="w-full h-full border-0"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                    referrerPolicy="no-referrer"
                  />
                </div>
              </div>
            ) : (
              // Desktop and responsive modes
              <div
                className={cn(
                  'rounded-sm border overflow-hidden relative',
                  screenSize === 'responsive' && 'shadow-lg'
                )}
                style={getIframeContainerStyle()}
              >
                <iframe
                  src={url}
                  title={t('preview.browser.title')}
                  className={cn(
                    'w-full h-full border-0',
                    isResizing && 'pointer-events-none'
                  )}
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                  referrerPolicy="no-referrer"
                />

                {/* Resize handles for responsive mode */}
                {screenSize === 'responsive' && (
                  <>
                    {/* Right edge handle */}
                    <div
                      className="absolute top-0 right-0 w-2 h-full cursor-ew-resize hover:bg-brand/30 transition-colors"
                      onMouseDown={onResizeStart('right')}
                      onTouchStart={onResizeStart('right')}
                    />
                    {/* Bottom edge handle */}
                    <div
                      className="absolute bottom-0 left-0 w-full h-2 cursor-ns-resize hover:bg-brand/30 transition-colors"
                      onMouseDown={onResizeStart('bottom')}
                      onTouchStart={onResizeStart('bottom')}
                    />
                    {/* Corner handle */}
                    <div
                      className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize hover:bg-brand/30 transition-colors"
                      onMouseDown={onResizeStart('corner')}
                      onTouchStart={onResizeStart('corner')}
                    />
                  </>
                )}
              </div>
            )}
          </div>
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
                <p className="text-xs text-low">
                  Click &quot;Start&quot; in the toolbar above to begin
                </p>
                {handleFixDevScript && (
                  <PrimaryButton
                    variant="tertiary"
                    value={t('scriptFixer.fixScript')}
                    actionIcon={WrenchIcon}
                    onClick={handleFixDevScript}
                  />
                )}
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
