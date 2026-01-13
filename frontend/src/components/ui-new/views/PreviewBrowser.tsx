import type { RefObject } from 'react';
import { useState, useCallback, useRef, useEffect } from 'react';
import {
  PlayIcon,
  SpinnerIcon,
  WrenchIcon,
  StopIcon,
  ArrowSquareOutIcon,
  ArrowClockwiseIcon,
  CopyIcon,
  XIcon,
  Monitor,
  DeviceMobile,
  ArrowsOutCardinal,
} from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { PrimaryButton } from '../primitives/PrimaryButton';
import type { Repo } from 'shared/types';
import type {
  ScreenSize,
  ResponsiveDimensions,
} from '@/hooks/usePreviewSettings';

const MOBILE_WIDTH = 390;
const MOBILE_HEIGHT = 844;
const MIN_RESPONSIVE_WIDTH = 320;
const MIN_RESPONSIVE_HEIGHT = 480;

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
  responsiveDimensions: ResponsiveDimensions;
  onScreenSizeChange: (size: ScreenSize) => void;
  onResponsiveDimensionsChange: (dimensions: ResponsiveDimensions) => void;
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
  responsiveDimensions,
  onScreenSizeChange,
  onResponsiveDimensionsChange,
  repos,
  handleEditDevScript,
  handleFixDevScript,
  className,
}: PreviewBrowserProps) {
  const { t } = useTranslation(['tasks', 'common']);
  const isLoading = isStarting || (isServerRunning && !url);
  const showIframe = url && !isLoading && isServerRunning;
  const showToolbar = isServerRunning && (url || autoDetectedUrl);

  const hasDevScript = repos.some(
    (repo) => repo.dev_server_script && repo.dev_server_script.trim() !== ''
  );

  // Responsive resize state
  const [isResizing, setIsResizing] = useState(false);
  const [resizeDirection, setResizeDirection] = useState<
    'right' | 'bottom' | 'corner' | null
  >(null);
  const [localDimensions, setLocalDimensions] = useState(responsiveDimensions);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync local dimensions with prop when not resizing
  useEffect(() => {
    if (!isResizing) {
      setLocalDimensions(responsiveDimensions);
    }
  }, [responsiveDimensions, isResizing]);

  const handleResizeStart = useCallback(
    (direction: 'right' | 'bottom' | 'corner') =>
      (e: React.MouseEvent | React.TouchEvent) => {
        e.preventDefault();
        setIsResizing(true);
        setResizeDirection(direction);
      },
    []
  );

  useEffect(() => {
    if (!isResizing || !resizeDirection) return;

    const handleMove = (clientX: number, clientY: number) => {
      if (!containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();

      setLocalDimensions((prev) => {
        let newWidth = prev.width;
        let newHeight = prev.height;

        if (resizeDirection === 'right' || resizeDirection === 'corner') {
          newWidth = Math.max(
            MIN_RESPONSIVE_WIDTH,
            clientX - containerRect.left
          );
        }

        if (resizeDirection === 'bottom' || resizeDirection === 'corner') {
          newHeight = Math.max(
            MIN_RESPONSIVE_HEIGHT,
            clientY - containerRect.top
          );
        }

        return { width: newWidth, height: newHeight };
      });
    };

    const handleMouseMove = (e: MouseEvent) => {
      handleMove(e.clientX, e.clientY);
    };

    const handleTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      handleMove(touch.clientX, touch.clientY);
    };

    const handleEnd = () => {
      setIsResizing(false);
      setResizeDirection(null);
      onResponsiveDimensionsChange(localDimensions);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleEnd);
    document.addEventListener('touchmove', handleTouchMove);
    document.addEventListener('touchend', handleEnd);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleEnd);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleEnd);
    };
  }, [isResizing, resizeDirection, localDimensions, onResponsiveDimensionsChange]);

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
        'w-full h-full bg-secondary flex flex-col overflow-hidden',
        className
      )}
    >
      {/* Floating Toolbar */}
      {showToolbar && (
        <div className="flex items-center gap-half p-base bg-panel border-b border-border shrink-0">
          {/* URL Input */}
          <div className="flex items-center gap-half bg-secondary rounded-sm px-base py-half flex-1 min-w-0">
            <input
              ref={urlInputRef}
              type="text"
              value={urlInputValue}
              onChange={(e) => onUrlInputChange(e.target.value)}
              placeholder={autoDetectedUrl ?? 'Enter URL...'}
              className={cn(
                'flex-1 font-mono text-sm bg-transparent border-none outline-none min-w-0',
                isUsingOverride
                  ? 'text-normal'
                  : 'text-low placeholder:text-low'
              )}
            />
            {isUsingOverride && (
              <button
                type="button"
                onClick={onClearOverride}
                className="text-low hover:text-normal"
                aria-label="Clear URL override"
                title="Revert to auto-detected URL"
              >
                <XIcon className="size-icon-sm" />
              </button>
            )}
            <button
              type="button"
              onClick={onCopyUrl}
              className="text-low hover:text-normal"
              aria-label="Copy URL"
              title="Copy URL"
            >
              <CopyIcon className="size-icon-sm" />
            </button>
            <button
              type="button"
              onClick={onOpenInNewTab}
              className="text-low hover:text-normal"
              aria-label="Open in new tab"
              title="Open in new tab"
            >
              <ArrowSquareOutIcon className="size-icon-sm" />
            </button>
            <button
              type="button"
              onClick={onRefresh}
              className="text-low hover:text-normal"
              aria-label="Refresh"
              title="Refresh preview"
            >
              <ArrowClockwiseIcon className="size-icon-sm" />
            </button>
          </div>

          {/* Screen Size Toggle */}
          <div className="flex items-center rounded-sm border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => onScreenSizeChange('desktop')}
              className={cn(
                'p-half transition-colors',
                screenSize === 'desktop'
                  ? 'bg-secondary text-normal'
                  : 'text-low hover:text-normal hover:bg-secondary/50'
              )}
              aria-label="Desktop view"
              title="Desktop view"
            >
              <Monitor className="size-icon-sm" />
            </button>
            <button
              type="button"
              onClick={() => onScreenSizeChange('mobile')}
              className={cn(
                'p-half transition-colors',
                screenSize === 'mobile'
                  ? 'bg-secondary text-normal'
                  : 'text-low hover:text-normal hover:bg-secondary/50'
              )}
              aria-label="Mobile view (390x844)"
              title="Mobile view (390x844)"
            >
              <DeviceMobile className="size-icon-sm" />
            </button>
            <button
              type="button"
              onClick={() => onScreenSizeChange('responsive')}
              className={cn(
                'p-half transition-colors',
                screenSize === 'responsive'
                  ? 'bg-secondary text-normal'
                  : 'text-low hover:text-normal hover:bg-secondary/50'
              )}
              aria-label="Responsive view (resizable)"
              title="Responsive view (resizable)"
            >
              <ArrowsOutCardinal className="size-icon-sm" />
            </button>
          </div>

          {/* Dimensions display for responsive mode */}
          {screenSize === 'responsive' && (
            <span className="text-xs text-low font-mono whitespace-nowrap">
              {Math.round(localDimensions.width)} x{' '}
              {Math.round(localDimensions.height)}
            </span>
          )}

          {/* Stop Button */}
          <PrimaryButton
            variant="tertiary"
            value={t('preview.browser.stopButton')}
            actionIcon={isStopping ? 'spinner' : StopIcon}
            onClick={onStop}
            disabled={isStopping}
          />
        </div>
      )}

      {/* Content area */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 relative overflow-auto"
      >
        {showIframe ? (
          <div
            className={cn(
              'h-full',
              screenSize === 'desktop'
                ? 'bg-brand/20 border p-double'
                : 'flex items-center justify-center p-double'
            )}
          >
            <div
              className={cn(
                'rounded-sm border overflow-hidden relative',
                screenSize !== 'desktop' && 'shadow-lg'
              )}
              style={getIframeContainerStyle()}
            >
              <iframe
                src={url}
                title={t('preview.browser.title')}
                className="w-full h-full border-0"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                referrerPolicy="no-referrer"
              />

              {/* Resize handles for responsive mode */}
              {screenSize === 'responsive' && (
                <>
                  {/* Right edge handle */}
                  <div
                    className="absolute top-0 right-0 w-2 h-full cursor-ew-resize hover:bg-brand/30 transition-colors"
                    onMouseDown={handleResizeStart('right')}
                    onTouchStart={handleResizeStart('right')}
                  />
                  {/* Bottom edge handle */}
                  <div
                    className="absolute bottom-0 left-0 w-full h-2 cursor-ns-resize hover:bg-brand/30 transition-colors"
                    onMouseDown={handleResizeStart('bottom')}
                    onTouchStart={handleResizeStart('bottom')}
                  />
                  {/* Corner handle */}
                  <div
                    className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize hover:bg-brand/30 transition-colors"
                    onMouseDown={handleResizeStart('corner')}
                    onTouchStart={handleResizeStart('corner')}
                  />
                </>
              )}
            </div>
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
                <div className="flex gap-base">
                  <PrimaryButton
                    value={t('preview.browser.startButton')}
                    actionIcon={PlayIcon}
                    onClick={onStart}
                    disabled={isStarting}
                  />
                  {handleFixDevScript && (
                    <PrimaryButton
                      variant="tertiary"
                      value={t('scriptFixer.fixScript')}
                      actionIcon={WrenchIcon}
                      onClick={handleFixDevScript}
                    />
                  )}
                </div>
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
