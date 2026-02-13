import { useState, useEffect } from 'react';
import { getRemoteApiBaseUrl } from '@/lib/remoteApi';

export function useRemoteApiBase(): string | null {
  const [baseUrl, setBaseUrl] = useState<string | null>(null);

  useEffect(() => {
    getRemoteApiBaseUrl().then(setBaseUrl);
  }, []);

  return baseUrl;
}
