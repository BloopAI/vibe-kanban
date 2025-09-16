import { memo, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Clock, Loader2, Send, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'offline' | 'sent';

type Status = {
  save: { state: SaveStatus; isSaving: boolean };
  draft: { isLoaded: boolean; isSending: boolean };
  queue: { isUnqueuing: boolean; isQueued: boolean };
};

type Props = { status: Status };

function FollowUpStatusRowImpl({ status }: Props) {
  const { save, draft, queue } = status;

  // Nonce keys to retrigger CSS animation; no JS timers.
  const [savedNonce, setSavedNonce] = useState<number | null>(null);
  const [sentNonce, setSentNonce] = useState<number | null>(null);
  const prevIsSendingRef = useRef<boolean>(draft.isSending);

  // Show "Draft saved" by bumping key to restart CSS animation
  useEffect(() => {
    if (save.state === 'saved') setSavedNonce(Date.now());
  }, [save.state]);

  // Show "Follow-up sent" on isSending rising edge
  useEffect(() => {
    const now = draft.isSending;
    if (now && !prevIsSendingRef.current) {
      setSentNonce(Date.now());
    }
    prevIsSendingRef.current = now;
  }, [draft.isSending]);
  return (
    <div className="flex items-center justify-between text-xs min-h-6 h-6 px-0.5">
      <div className="text-muted-foreground">
        {save.state === 'saving' && save.isSaving ? (
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 bg-muted animate-in fade-in-0',
              'italic'
            )}
          >
            <Loader2 className="animate-spin h-3 w-3" /> Saving…
          </span>
        ) : save.state === 'offline' ? (
          <span className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 bg-muted text-amber-700 animate-in fade-in-0">
            <WifiOff className="h-3 w-3" /> Offline — changes pending
          </span>
        ) : sentNonce ? (
          <span
            key={sentNonce}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 bg-muted text-emerald-700 animate-pill'
            )}
            onAnimationEnd={() => setSentNonce(null)}
          >
            <Send className="h-3 w-3" /> Follow-up sent
          </span>
        ) : savedNonce ? (
          <span
            key={savedNonce}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 bg-muted text-emerald-700 animate-pill'
            )}
            onAnimationEnd={() => setSavedNonce(null)}
          >
            <CheckCircle2 className="h-3 w-3" /> Draft saved
          </span>
        ) : null}
      </div>
      <div className="text-muted-foreground">
        {queue.isUnqueuing ? (
          <span className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 bg-muted animate-in fade-in-0">
            <Loader2 className="animate-spin h-3 w-3" /> Unlocking…
          </span>
        ) : !draft.isLoaded ? (
          <span className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 bg-muted animate-in fade-in-0">
            <Loader2 className="animate-spin h-3 w-3" /> Loading draft…
          </span>
        ) : draft.isSending ? (
          <span className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 bg-muted animate-in fade-in-0">
            <Loader2 className="animate-spin h-3 w-3" /> Sending follow-up…
          </span>
        ) : queue.isQueued ? (
          <span className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 bg-muted animate-in fade-in-0">
            <Clock className="h-3 w-3" /> Queued for next turn. Edits are
            locked.
          </span>
        ) : null}
      </div>
    </div>
  );
}

export const FollowUpStatusRow = memo(FollowUpStatusRowImpl);
