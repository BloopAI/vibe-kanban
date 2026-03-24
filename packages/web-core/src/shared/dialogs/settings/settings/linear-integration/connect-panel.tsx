import { useState } from 'react';
import { SpinnerIcon } from '@phosphor-icons/react';
import { Button } from '@vibe/ui/components/Button';
import { cn } from '@/shared/lib/utils';
import { makeRequest } from '@/shared/lib/remoteApi';

interface LinearTeam {
  id: string;
  name: string;
  key: string;
}

interface Props {
  projectId: string;
  onConnected: () => void;
}

export function ConnectLinearPanel({ projectId, onConnected }: Props) {
  const [apiKey, setApiKey] = useState('');
  const [teams, setTeams] = useState<LinearTeam[] | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [validating, setValidating] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');

  async function fetchTeams() {
    if (!apiKey.trim()) return;
    setValidating(true);
    setError('');
    setTeams(null);
    try {
      const res = await makeRequest('/v1/linear/teams-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      });
      if (!res.ok) {
        const text = await res.text();
        setError(text || 'Invalid API key');
        return;
      }
      const data: LinearTeam[] = await res.json();
      setTeams(data);
      if (data.length === 1) setSelectedTeamId(data[0].id);
    } catch {
      setError('Network error');
    } finally {
      setValidating(false);
    }
  }

  async function handleConnect() {
    if (!selectedTeamId) {
      setError('Select a team');
      return;
    }
    setConnecting(true);
    setError('');
    try {
      const res = await makeRequest('/v1/linear/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          apiKey,
          linearTeamId: selectedTeamId,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        setError(text || 'Failed to connect');
        return;
      }
      onConnected();
    } catch {
      setError('Network error');
    } finally {
      setConnecting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium text-normal block mb-2">
          Linear Personal API Key
        </label>
        <div className="flex gap-2">
          <input
            type="password"
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              setTeams(null);
            }}
            placeholder="lin_api_..."
            className={cn(
              'flex-1 bg-secondary border border-border rounded-sm px-base py-half text-sm text-high',
              'placeholder:text-low placeholder:opacity-80 focus:outline-none focus:ring-1 focus:ring-brand'
            )}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => void fetchTeams()}
            disabled={!apiKey.trim() || validating}
          >
            {validating && (
              <SpinnerIcon
                className="size-icon-xs mr-1 animate-spin"
                weight="bold"
              />
            )}
            {validating ? 'Checking\u2026' : 'Validate'}
          </Button>
        </div>
        <p className="text-xs text-low mt-1">
          Create an API key at{' '}
          <a
            href="https://linear.app/settings/api"
            target="_blank"
            rel="noreferrer"
            className="text-brand hover:underline"
          >
            linear.app/settings/api
          </a>
        </p>
      </div>

      {teams !== null && (
        <div>
          <label className="text-sm font-medium text-normal block mb-2">
            Linear Team
          </label>
          <select
            value={selectedTeamId}
            onChange={(e) => setSelectedTeamId(e.target.value)}
            className={cn(
              'w-full bg-secondary border border-border rounded-sm px-base py-half text-sm text-high',
              'focus:outline-none focus:ring-1 focus:ring-brand'
            )}
          >
            <option value="">Select a team\u2026</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.key})
              </option>
            ))}
          </select>
        </div>
      )}

      {error && <p className="text-sm text-error">{error}</p>}

      <Button
        onClick={() => void handleConnect()}
        disabled={!selectedTeamId || connecting}
        size="sm"
      >
        {connecting && (
          <SpinnerIcon
            className="size-icon-xs mr-1 animate-spin"
            weight="bold"
          />
        )}
        {connecting ? 'Connecting\u2026' : 'Connect & Import'}
      </Button>
    </div>
  );
}
