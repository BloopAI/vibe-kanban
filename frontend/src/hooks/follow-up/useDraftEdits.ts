import { useEffect, useRef, useState } from 'react';
import type { FollowUpDraft } from 'shared/types';

type Args = {
  draft: FollowUpDraft | null;
  lastServerVersionRef: React.MutableRefObject<number>;
  suppressNextSaveRef: React.MutableRefObject<boolean>;
  forceNextApplyRef: React.MutableRefObject<boolean>;
};

export function useDraftEdits({
  draft,
  lastServerVersionRef,
  suppressNextSaveRef,
  forceNextApplyRef,
}: Args) {
  const [message, setMessage] = useState('');

  const localDirtyRef = useRef<boolean>(false);

  useEffect(() => {
    if (!draft) return;
    const incomingVersion = Number(draft.version ?? 0n);

    if (incomingVersion === lastServerVersionRef.current) return;
    suppressNextSaveRef.current = true;
    const isInitial = lastServerVersionRef.current === -1;
    const shouldForce = forceNextApplyRef.current;
    const allowApply = isInitial || shouldForce || !localDirtyRef.current;
    if (allowApply && incomingVersion >= lastServerVersionRef.current) {
      setMessage(draft.prompt || '');
      localDirtyRef.current = false;
      lastServerVersionRef.current = incomingVersion;
      if (shouldForce) forceNextApplyRef.current = false;
    } else if (incomingVersion > lastServerVersionRef.current) {
      // Skip applying server changes while user is editing; still advance version to avoid loops
      lastServerVersionRef.current = incomingVersion;
    }
  }, [draft]);

  return {
    message,
    setMessage: (v: string) => {
      localDirtyRef.current = true;
      setMessage(v);
    },
  } as const;
}
