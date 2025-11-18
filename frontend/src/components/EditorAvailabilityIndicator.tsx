import { Check, AlertCircle, Loader2, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { EditorAvailabilityState } from '@/hooks/useEditorAvailability';
import { EditorType } from 'shared/types';
import { getEditorInstallUrl } from '@/lib/editor-utils';

interface EditorAvailabilityIndicatorProps {
  availability: EditorAvailabilityState;
  editorType?: EditorType;
}

/**
 * Visual indicator showing whether an editor is available on the system.
 * Shows loading spinner, green checkmark, or orange warning.
 */
export function EditorAvailabilityIndicator({
  availability,
  editorType,
}: EditorAvailabilityIndicatorProps) {
  const { t } = useTranslation('settings');

  if (!availability) return null;

  const installUrl = editorType ? getEditorInstallUrl(editorType) : undefined;

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
          <Check className="h-4 w-4 text-green-500" />
          <span className="text-green-600">
            {t('settings.general.editor.availability.available')}
          </span>
        </>
      )}
      {availability === 'unavailable' && (
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
                  Install
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