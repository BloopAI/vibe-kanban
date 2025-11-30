import { useTranslation } from 'react-i18next';
import { useEffect } from 'react';

interface ReadyContentProps {
  url?: string;
  iframeKey: string;
  onIframeError: () => void;
  onFrameBlocked?: () => void;
}

export function ReadyContent({
  url,
  iframeKey,
  onIframeError,
  onFrameBlocked,
}: ReadyContentProps) {
  const { t } = useTranslation('tasks');

  // Detect if iframe failed to load within timeout
  useEffect(() => {
    if (!url) return;
    const timeout = setTimeout(() => {
      // Check if iframe loaded by attempting to access it
      const iframe = document.querySelector(
        'iframe[title*="preview"]'
      ) as HTMLIFrameElement;
      if (iframe) {
        try {
          // Try to access iframe content (will fail for X-Frame-Options)
          const iframeDoc =
            iframe.contentDocument || iframe.contentWindow?.document;
          if (!iframeDoc) {
            onFrameBlocked?.();
          }
        } catch (e) {
          // Cross-origin or X-Frame-Options blocking
          onFrameBlocked?.();
        }
      }
    }, 3000); // Give iframe 3s to load

    return () => clearTimeout(timeout);
  }, [url, iframeKey, onFrameBlocked]);

  return (
    <div className="flex-1">
      <iframe
        key={iframeKey}
        src={url}
        title={t('preview.iframe.title')}
        className="w-full h-full border-0"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
        referrerPolicy="no-referrer"
        onError={onIframeError}
      />
    </div>
  );
}
