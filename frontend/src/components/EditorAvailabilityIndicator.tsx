import { Check, AlertCircle, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { EditorAvailabilityState } from '@/hooks/useEditorAvailability';

interface EditorAvailabilityIndicatorProps {
  availability: EditorAvailabilityState;
}

/**
 * Visual indicator showing whether an editor is available on the system.
 * Shows loading spinner, green checkmark, or orange warning.
 */
export function EditorAvailabilityIndicator({
  availability,
}: EditorAvailabilityIndicatorProps) {
  const { t } = useTranslation('settings');

  if (!availability) return null;

  return (
    <div className="flex items-center gap-2 text-sm">
      {availability === 'checking' && (
        <>
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <span className="text-muted-foreground">
            {t('settings.general.editor.availability.checking')}
          </span>
        </>
      )}
      {availability === 'available' && (
        <>
          <Check className="h-4 w-4 text-success" />
          <span className="text-success">
            {t('settings.general.editor.availability.available')}
          </span>
        </>
      )}
      {availability === 'unavailable' && (
        <>
          <AlertCircle className="h-4 w-4 text-warning" />
          <span className="text-warning">
            {t('settings.general.editor.availability.notFound')}
          </span>
        </>
      )}
    </div>
  );
}
