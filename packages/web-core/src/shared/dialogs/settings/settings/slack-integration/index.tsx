import { useEffect, useState } from 'react';
import { SpinnerIcon } from '@phosphor-icons/react';
import { makeLocalApiRequest } from '@/shared/lib/localApiTransport';
import { SlackConnectPanel } from './connect-panel';

interface ConnectedState {
  connectionId: string;
  channelId: string;
}

interface Props {
  projectId: string;
}

export function SlackIntegration({ projectId }: Props) {
  const [connected, setConnected] = useState<ConnectedState | null | undefined>(
    undefined
  );

  function loadStatus() {
    makeLocalApiRequest(`/v1/slack/status?project_id=${projectId}`)
      .then((r) => r.json())
      .then(
        (data: {
          connected: boolean;
          connection_id?: string;
          channel_id?: string;
        }) => {
          if (data.connected && data.connection_id && data.channel_id) {
            setConnected({
              connectionId: data.connection_id,
              channelId: data.channel_id,
            });
          } else {
            setConnected(null);
          }
        }
      )
      .catch(() => setConnected(null));
  }

  useEffect(() => {
    loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  if (connected === undefined) {
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

  return (
    <SlackConnectPanel
      projectId={projectId}
      connected={connected}
      onConnected={setConnected}
      onDisconnected={() => setConnected(null)}
    />
  );
}
