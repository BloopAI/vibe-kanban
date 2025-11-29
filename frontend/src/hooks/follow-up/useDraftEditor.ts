import { useEffect, useRef, useState, useCallback } from 'react';
import type { Draft } from 'shared/types';

type PartialDraft = Pick<Draft, 'prompt'>;

type Args = {
  draft: PartialDraft | null;
};

export function useDraftEditor({ draft }: Args) {
  const [message, setMessageInner] = useState('');

  const localDirtyRef = useRef<boolean>(false);

  const isMessageLocallyDirty = useCallback(() => localDirtyRef.current, []);

  // Sync message with server when not locally dirty
  useEffect(() => {
    if (!draft) return;
    const serverPrompt = draft.prompt || '';
    if (!localDirtyRef.current) {
      setMessageInner(serverPrompt);
    } else if (serverPrompt === message) {
      // When server catches up to local text, clear dirty
      localDirtyRef.current = false;
    }
  }, [draft, message]);

  const setMessage = (v: React.SetStateAction<string>) => {
    localDirtyRef.current = true;
    if (typeof v === 'function') {
      setMessageInner((prev) => v(prev));
    } else {
      setMessageInner(v);
    }
  };

  return {
    message,
    setMessage,
    isMessageLocallyDirty,
  } as const;
}
