import { useState, useEffect } from 'react';
import { p2pHostsApi } from '@/shared/lib/p2p-hosts-api';
import type { P2pHost } from '@/shared/types/p2p-hosts';

export function useP2pHosts() {
  const [pairedHosts, setPairedHosts] = useState<P2pHost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    p2pHostsApi
      .listHosts()
      .then((hosts) => {
        if (!cancelled) {
          setPairedHosts(hosts.filter((h) => h.status === 'paired'));
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { pairedHosts, loading };
}
