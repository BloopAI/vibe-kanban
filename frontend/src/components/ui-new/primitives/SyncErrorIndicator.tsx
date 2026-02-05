import { WarningIcon, ArrowClockwiseIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { useSyncErrorContext } from '@/contexts/SyncErrorContext';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui-new/primitives/Popover';

/**
 * Displays a warning indicator when there are sync errors.
 * Shows a popover with error details on click.
 * Returns null when there are no errors.
 */
export function SyncErrorIndicator() {
  const { t } = useTranslation('common');
  const syncErrorContext = useSyncErrorContext();

  // Graceful fallback if not wrapped in provider
  if (!syncErrorContext || !syncErrorContext.hasErrors) {
    return null;
  }

  const { errors } = syncErrorContext;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center justify-center rounded-sm text-error hover:text-error/80"
          aria-label={`${errors.length} sync error${errors.length > 1 ? 's' : ''}`}
        >
          <WarningIcon className="size-icon-base" weight="fill" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="w-80">
        <div className="space-y-base">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-normal">
              {t('syncError.networkErrors')}
            </h4>
            <span className="text-xs text-low">
              {t('syncError.streamsAffected', { count: errors.length })}
            </span>
          </div>

          <div className="space-y-half max-h-48 overflow-y-auto">
            {errors.map((streamError) => (
              <div
                key={streamError.streamId}
                className="rounded-sm bg-error/10 p-half text-xs"
              >
                <div className="font-medium text-error">
                  {streamError.tableName}
                </div>
                <div className="text-low mt-quarter truncate">
                  {streamError.error.message}
                  {streamError.error.status && (
                    <span className="ml-1 text-error/70">
                      {t('syncError.status', {
                        status: streamError.error.status,
                      })}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => window.location.reload()}
            className="flex w-full items-center justify-center gap-half rounded-sm bg-primary px-base py-half text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            <ArrowClockwiseIcon className="size-icon-sm" />
            {t('syncError.refreshPage')}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
