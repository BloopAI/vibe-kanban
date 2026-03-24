import { useState } from 'react';
import { SpinnerIcon } from '@phosphor-icons/react';
import { Button } from '@vibe/ui/components/Button';
import { cn } from '@/shared/lib/utils';
import { makeLocalApiRequest } from '@/shared/lib/localApiTransport';

interface ConnectedState {
  connectionId: string;
  channelId: string;
}

interface Props {
  projectId: string;
  connected: ConnectedState | null;
  onConnected: (state: ConnectedState) => void;
  onDisconnected: () => void;
}

export function SlackConnectPanel({
  projectId,
  connected,
  onConnected,
  onDisconnected,
}: Props) {
  const [botToken, setBotToken] = useState('');
  const [channelId, setChannelId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleConnect() {
    setLoading(true);
    setError(null);
    try {
      const res = await makeLocalApiRequest('/v1/slack/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          bot_token: botToken,
          channel_id: channelId,
        }),
      });
      if (res.status === 422) {
        setError(
          'Invalid Slack bot token. Please check your token and try again.'
        );
        return;
      }
      if (!res.ok) {
        setError('Failed to connect. Please try again.');
        return;
      }
      const data: { connection_id: string; channel_id: string } =
        await res.json();
      onConnected({
        connectionId: data.connection_id,
        channelId: data.channel_id,
      });
      setBotToken('');
      setChannelId('');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDisconnect() {
    if (!connected) return;
    setLoading(true);
    try {
      await makeLocalApiRequest(
        `/v1/slack/connections/${connected.connectionId}`,
        { method: 'DELETE' }
      );
      onDisconnected();
    } catch {
      console.error('Failed to disconnect Slack');
    } finally {
      setLoading(false);
    }
  }

  if (connected) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-low">
          Connected to channel{' '}
          <span className="font-mono">{connected.channelId}</span>
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void handleDisconnect()}
          disabled={loading}
        >
          {loading && (
            <SpinnerIcon
              className="size-icon-xs mr-1 animate-spin"
              weight="bold"
            />
          )}
          {loading ? 'Disconnecting\u2026' : 'Disconnect'}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium text-normal block mb-2">
          Bot Token
        </label>
        <input
          type="password"
          value={botToken}
          onChange={(e) => setBotToken(e.target.value)}
          placeholder="xoxb-..."
          className={cn(
            'w-full bg-secondary border border-border rounded-sm px-base py-half text-sm text-high',
            'placeholder:text-low placeholder:opacity-80 focus:outline-none focus:ring-1 focus:ring-brand'
          )}
        />
      </div>
      <div>
        <label className="text-sm font-medium text-normal block mb-2">
          Channel ID
        </label>
        <input
          type="text"
          value={channelId}
          onChange={(e) => setChannelId(e.target.value)}
          placeholder="C0XXXXXXXXX"
          className={cn(
            'w-full bg-secondary border border-border rounded-sm px-base py-half text-sm text-high',
            'placeholder:text-low placeholder:opacity-80 focus:outline-none focus:ring-1 focus:ring-brand'
          )}
        />
      </div>
      {error && <p className="text-sm text-error">{error}</p>}
      <Button
        onClick={() => void handleConnect()}
        disabled={loading || !botToken || !channelId}
        size="sm"
      >
        {loading && (
          <SpinnerIcon
            className="size-icon-xs mr-1 animate-spin"
            weight="bold"
          />
        )}
        {loading ? 'Connecting\u2026' : 'Connect'}
      </Button>
    </div>
  );
}
