import { useState, useEffect } from 'react';
import { systemApi } from '@/lib/api';
import type { Environment } from 'shared/types';

export function useSystemInfo() {
  const [systemInfo, setSystemInfo] = useState<Environment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSystemInfo = async () => {
      try {
        const data = await systemApi.getInfo();
        setSystemInfo(data.environment);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchSystemInfo();
  }, []);

  return { systemInfo, loading, error };
}
