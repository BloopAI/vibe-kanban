import { Check, AlertCircle, Loader2, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { EditorAvailability } from '@/hooks/useEditorAvailability';

interface EditorAvailabilityIndicatorProps {
  availability: EditorAvailability;
}

/**
 * Visual indicator showing whether an editor is available on the system.
 * Shows loading spinner, green checkmark, or orange warning.
 */
export function EditorAvailabilityIndicator({
  availability,
}: EditorAvailabilityIndicatorProps) {
  const { t } = useTranslation('settings');

  if (!availability.status) return null;

  const { status, installUrl } = availability;

  return (
    <div className="flex items-center gap-2 text-sm">
      {status === 'checking' && (
        <>
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <span className="text-muted-foreground">
            {t('settings.general.editor.availability.checking')}
          </span>
        </>
      )}
      {status === 'available' && (
        <>
          <Check className="h-4 w-4 text-green-500" />
          <span className="text-green-600">
            {t('settings.general.editor.availability.available')}
          </span>
        </>
      )}
      {status === 'unavailable' && (
        <>
          <AlertCircle className="h-4 w-4 text-orange-500" />
          <span className="text-orange-600">
            {t('settings.general.editor.availability.notFound')}
            {installUrl && (
              <>
                {' • '}
                <a
                  href={installUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center hover:underline"
                >
                  {t('settings.general.editor.availability.install')}
                  <ExternalLink className="ml-1 h-3 w-3" />
                </a>
              </>
            )}
          </span>
        </>
      )}
    </div>
  );
}
