import { useTranslation } from 'react-i18next';

interface ReadyContentProps {
  url?: string;
  iframeKey: string;
  onIframeError: () => void;
}

export function ReadyContent({
  url,
  iframeKey,
  onIframeError,
}: ReadyContentProps) {
  const { t } = useTranslation('tasks');

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
