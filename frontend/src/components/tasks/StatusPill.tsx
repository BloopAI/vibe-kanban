import { cn } from '@/lib/utils';
import {
  Loader2,
  WifiOff,
  CheckCircle2,
  Send,
  AlertCircle,
} from 'lucide-react';
import type { SaveStatus } from '@/hooks/useTransientStatus';

interface StatusPillProps {
  status: SaveStatus;
  fading?: boolean;
  saving?: boolean;
}

export function StatusPill({ status, fading, saving }: StatusPillProps) {
  if (status === 'saving') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 bg-muted animate-in fade-in-0',
          saving && 'italic'
        )}
      >
        <Loader2 className="animate-spin h-3 w-3" /> Saving…
      </span>
    );
  }
  if (status === 'offline') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 bg-muted text-amber-700 animate-in fade-in-0">
        <WifiOff className="h-3 w-3" /> Offline — changes pending
      </span>
    );
  }
  if (status === 'saved') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 bg-muted text-emerald-700 transition-opacity duration-200 animate-in fade-in-0',
          fading && 'opacity-0'
        )}
      >
        <CheckCircle2 className="h-3 w-3" /> Draft saved
      </span>
    );
  }
  if (status === 'sent') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 bg-muted text-emerald-700 transition-opacity duration-200 animate-in fade-in-0',
          fading && 'opacity-0'
        )}
      >
        <Send className="h-3 w-3" /> Follow-up sent
      </span>
    );
  }
  if (status === 'conflicted') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 bg-muted text-amber-700 transition-opacity duration-200 animate-in fade-in-0',
          fading && 'opacity-0'
        )}
      >
        <AlertCircle className="h-3 w-3" /> Updated in another window
      </span>
    );
  }
  return null;
}
