import { useEffect, useState } from 'react';
import { SpinnerIcon } from '@phosphor-icons/react';
import { makeRequest } from '@/shared/lib/remoteApi';
import { ConnectLinearPanel } from './connect-panel';
import { StatusMappingPanel } from './status-mapping';
import { SyncStatusPanel } from './sync-status';

interface LinearConnection {
  id: string;
  projectId: string;
  linearTeamId: string;
  syncEnabled: boolean;
  hasWebhook: boolean;
  createdAt: string;
}

interface Props {
  projectId: string;
  vkStatuses: Array<{ id: string; name: string; color: string }>;
}

export function LinearIntegration({ projectId, vkStatuses }: Props) {
  const [connection, setConnection] = useState<
    LinearConnection | null | undefined
  >(undefined);

  function loadConnection() {
    makeRequest('/v1/linear/connections')
      .then((r) => r.json())
      .then((conns: LinearConnection[]) => {
        const conn = conns.find((c) => c.projectId === projectId) ?? null;
        setConnection(conn);
      })
      .catch(() => setConnection(null));
  }

  useEffect(() => {
    loadConnection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function handleToggleSync(enabled: boolean) {
    if (!connection) return;
    await makeRequest(`/v1/linear/connections/${connection.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ syncEnabled: enabled }),
    });
    setConnection((c) => (c ? { ...c, syncEnabled: enabled } : c));
  }

  if (connection === undefined) {
    return (
      <div className="flex items-center gap-2 py-2">
        <SpinnerIcon
          className="size-icon-xs animate-spin text-low"
          weight="bold"
        />
        <span className="text-sm text-low">Loading&hellip;</span>
      </div>
    );
  }

  if (!connection) {
    return (
      <ConnectLinearPanel projectId={projectId} onConnected={loadConnection} />
    );
  }

  return (
    <div className="space-y-6">
      <SyncStatusPanel
        connection={connection}
        onDisconnect={() => setConnection(null)}
        onToggleSync={(enabled) => void handleToggleSync(enabled)}
      />
      <StatusMappingPanel
        connectionId={connection.id}
        vkStatuses={vkStatuses}
      />
    </div>
  );
}
