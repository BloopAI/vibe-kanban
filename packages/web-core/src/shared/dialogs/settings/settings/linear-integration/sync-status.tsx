import { useEffect, useState } from 'react';
import {
  SpinnerIcon,
  CheckCircleIcon,
  WarningIcon,
} from '@phosphor-icons/react';
import { Button } from '@vibe/ui/components/Button';
import { Switch } from '@vibe/ui/components/Switch';
import { makeRequest } from '@/shared/lib/remoteApi';

interface Connection {
  id: string;
  syncEnabled: boolean;
  hasWebhook: boolean;
  createdAt: string;
}

interface SyncStats {
  linkedCount: number;
  lastSyncedAt: string | null;
}

interface Props {
  connection: Connection;
  onDisconnect: () => void;
  onToggleSync: (enabled: boolean) => void;
}

export function SyncStatusPanel({
  connection,
  onDisconnect,
  onToggleSync,
}: Props) {
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [stats, setStats] = useState<SyncStats | null>(null);

  useEffect(() => {
    makeRequest(`/v1/linear/connections/${connection.id}/stats`)
      .then((r) => r.json())
      .then((data: SyncStats) => setStats(data))
      .catch(() => {});
  }, [connection.id]);

  async function triggerSync() {
    setSyncing(true);
    try {
      await makeRequest(`/v1/linear/connections/${connection.id}/sync`, {
        method: 'POST',
      });
    } catch {
      // ignore
    } finally {
      setSyncing(false);
    }
  }

  async function handleDisconnect() {
    if (
      !window.confirm(
        'Disconnect Linear? This will remove all issue links (VK issues are kept).'
      )
    ) {
      return;
    }
    setDisconnecting(true);
    try {
      await makeRequest(`/v1/linear/connections/${connection.id}`, {
        method: 'DELETE',
      });
      onDisconnect();
    } catch {
      // ignore
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            {connection.hasWebhook ? (
              <CheckCircleIcon
                className="size-icon-xs text-success"
                weight="fill"
              />
            ) : (
              <WarningIcon
                className="size-icon-xs text-warning"
                weight="fill"
              />
            )}
            <p className="text-sm font-medium text-high">
              {connection.hasWebhook ? 'Connected' : 'Connected (no webhook)'}
            </p>
          </div>
          <p className="text-xs text-low">
            Connected{' '}
            {new Date(connection.createdAt).toLocaleDateString(undefined, {
              dateStyle: 'medium',
            })}
          </p>
          {stats && (
            <p className="text-xs text-low">
              {stats.linkedCount} issue
              {stats.linkedCount !== 1 ? 's' : ''} linked
              {stats.lastSyncedAt &&
                ` \u00b7 last synced ${new Date(stats.lastSyncedAt).toLocaleString()}`}
            </p>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm text-normal cursor-pointer shrink-0">
          <Switch
            checked={connection.syncEnabled}
            onCheckedChange={onToggleSync}
          />
          Sync enabled
        </label>
      </div>

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => void triggerSync()}
          disabled={syncing}
        >
          {syncing && (
            <SpinnerIcon
              className="size-icon-xs mr-1 animate-spin"
              weight="bold"
            />
          )}
          {syncing ? 'Syncing\u2026' : 'Sync now'}
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => void handleDisconnect()}
          disabled={disconnecting}
        >
          {disconnecting && (
            <SpinnerIcon
              className="size-icon-xs mr-1 animate-spin"
              weight="bold"
            />
          )}
          Disconnect
        </Button>
      </div>
    </div>
  );
}
