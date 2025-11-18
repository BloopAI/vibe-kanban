import { Check, AlertCircle, Loader2 } from 'lucide-react';
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
  if (!availability) return null;

  return (
    <div className="flex items-center gap-2 text-sm">
      {availability === 'checking' && (
        <>
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <span className="text-muted-foreground">
            Checking availability...
          </span>
        </>
      )}
      {availability === 'available' && (
        <>
          <Check className="h-4 w-4 text-green-500" />
          <span className="text-green-600">Available</span>
        </>
      )}
      {availability === 'unavailable' && (
        <>
          <AlertCircle className="h-4 w-4 text-orange-500" />
          <span className="text-orange-600">Not found in PATH</span>
        </>
      )}
    </div>
  );
}
