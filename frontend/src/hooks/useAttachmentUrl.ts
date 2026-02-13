import { useState, useEffect } from 'react';
import { fetchAttachmentSasUrl } from '@/lib/remoteApi';

interface AttachmentUrlResult {
  url: string | null;
  loading: boolean;
  error: string | null;
}

export function useAttachmentUrl(
  attachmentId: string | null,
  type: 'file' | 'thumbnail'
): AttachmentUrlResult {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!attachmentId) {
      setUrl(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchAttachmentSasUrl(attachmentId, type)
      .then((sasUrl) => {
        if (!cancelled) {
          setUrl(sasUrl);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Failed to load attachment'
          );
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [attachmentId, type]);

  return { url, loading, error };
}
