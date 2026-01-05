import { useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

interface ReadyContentProps {
  url?: string;
  iframeKey: string;
  onIframeError: () => void;
  onIframeLoad?: () => void;
}

export function ReadyContent({
  url,
  iframeKey,
  onIframeError,
  onIframeLoad,
}: ReadyContentProps) {
  const { t } = useTranslation('tasks');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Detect if iframe content actually loaded or is blocked
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const handleLoad = () => {
      // Try to detect if the iframe actually loaded content
      // In PWA mode, the iframe might "load" but with blocked/empty content
      try {
        // This will throw if cross-origin and blocked
        const hasContent = iframe.contentWindow?.document;
        if (hasContent) {
          onIframeLoad?.();
        }
      } catch {
        // Cross-origin access denied is expected for localhost dev servers
        // If we get here, the iframe loaded something (even if cross-origin)
        onIframeLoad?.();
      }
    };

    iframe.addEventListener('load', handleLoad);
    return () => iframe.removeEventListener('load', handleLoad);
  }, [iframeKey, onIframeLoad]);

  return (
    <div className="flex-1">
      <iframe
        ref={iframeRef}
        key={iframeKey}
        src={url}
        title={t('preview.iframe.title')}
        className="w-full h-full border-0"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
        // Allow cross-origin features that might help in PWA mode
        allow="cross-origin-isolated; clipboard-read; clipboard-write"
        referrerPolicy="no-referrer"
        onError={onIframeError}
      />
    </div>
  );
}
