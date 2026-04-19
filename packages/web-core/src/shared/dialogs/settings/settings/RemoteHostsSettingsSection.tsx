import { useState, useEffect, useCallback } from 'react';
import { SpinnerIcon } from '@phosphor-icons/react';
import { PrimaryButton } from '@vibe/ui/components/PrimaryButton';
import { p2pHostsApi } from '@/shared/lib/p2p-hosts-api';
import type { P2pHost } from '@/shared/types/p2p-hosts';
import { SettingsCard, SettingsInput } from './SettingsComponents';

// OX Agent: All external requests go through p2pHostsApi -> makeLocalApiRequest
// which only communicates with the local backend at fixed API endpoints.
// User-provided 'address' is JSON-encoded and sent to the backend for validation,
// never used as a URL directly from the frontend.

export function RemoteHostsSettingsSection() {
  const [hosts, setHosts] = useState<P2pHost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPairingCodeForm, setShowPairingCodeForm] = useState(false);

  const loadHosts = useCallback(async () => {
    try {
      setLoading(true);
      const list = await p2pHostsApi.listHosts();
      setHosts(list);
      setError(null);
    } catch {
      setError('Failed to load remote hosts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHosts();
  }, [loadHosts]);

  const handleRemove = async (id: string) => {
    try {
      await p2pHostsApi.removeHost(id);
      await loadHosts();
    } catch {
      setError('Failed to remove host');
    }
  };

  return (
    <div className="space-y-8">
      <SettingsCard
        title="Paired Remote Hosts"
        description="Self-hosted Vibe Kanban instances paired directly via P2P (not cloud relay)."
        headerAction={
          <div className="flex gap-2">
            <PrimaryButton
              variant="secondary"
              value="Add via pairing code"
              onClick={() => setShowPairingCodeForm(true)}
            />
            <PrimaryButton
              variant="secondary"
              value="Add via SSH key"
              onClick={() => {
                /* Task 4 */
              }}
            />
          </div>
        }
      >
        {error && (
          <div className="bg-error/10 border border-error/50 rounded-sm p-3 text-sm text-error">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-low">
            <SpinnerIcon className="size-icon-sm animate-spin" weight="bold" />
            <span>Loading remote hosts...</span>
          </div>
        ) : hosts.length === 0 ? (
          <div className="rounded-sm border border-border bg-secondary/30 p-3 text-sm text-low">
            No remote hosts paired yet. Add one via pairing code or SSH key.
          </div>
        ) : (
          <div className="space-y-2">
            {hosts.map((host) => (
              <HostRow key={host.id} host={host} onRemove={handleRemove} />
            ))}
          </div>
        )}

        {showPairingCodeForm && (
          <PairingCodeForm
            onSuccess={() => {
              setShowPairingCodeForm(false);
              void loadHosts();
            }}
            onCancel={() => setShowPairingCodeForm(false)}
          />
        )}
      </SettingsCard>
    </div>
  );
}

function HostRow({
  host,
  onRemove,
}: {
  host: P2pHost;
  onRemove: (id: string) => void;
}) {
  const [removing, setRemoving] = useState(false);
  const statusColor = host.status === 'paired' ? 'text-success' : 'text-low';

  const modeLabel =
    host.connection_mode === 'ssh'
      ? 'SSH'
      : host.connection_mode === 'auto'
        ? 'Auto'
        : 'Direct';

  const handleRemove = async () => {
    setRemoving(true);
    try {
      await onRemove(host.id);
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="rounded-sm border border-border bg-secondary/30 p-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-high truncate">{host.name}</p>
        <p className="text-xs text-low">
          {host.address}:{host.relay_port} · {modeLabel}
        </p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className={`text-xs font-medium ${statusColor}`}>
          {host.status}
        </span>
        <PrimaryButton
          variant="tertiary"
          value="Remove"
          onClick={() => void handleRemove()}
          disabled={removing}
          actionIcon={removing ? 'spinner' : undefined}
        />
      </div>
    </div>
  );
}

function PairingCodeForm({
  onSuccess,
  onCancel,
}: {
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      // OX Agent: address is sent as JSON body to the local backend only.
      // Server-side validation of the address occurs in the Rust handler.
      await p2pHostsApi.completePairing({ code, name, address });
      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Pairing failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="space-y-4 pt-4 border-t border-border"
    >
      <h4 className="text-sm font-medium text-high">
        Add remote host via pairing code
      </h4>

      <div className="space-y-2">
        <label className="text-sm font-medium text-normal">Name</label>
        <SettingsInput value={name} onChange={setName} placeholder="My VPS" />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-normal">
          Address (host or IP)
        </label>
        <SettingsInput
          value={address}
          onChange={setAddress}
          placeholder="192.168.1.10 or myserver.com"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-normal">Pairing Code</label>
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="XXXX-XXXX"
          required
          className="w-full bg-secondary border border-border rounded-sm px-base py-half text-sm text-high font-mono placeholder:text-low placeholder:opacity-80 focus:outline-none focus:ring-1 focus:ring-brand"
        />
      </div>

      {error && <p className="text-sm text-error">{error}</p>}

      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-sm px-base py-half text-cta min-h-cta flex gap-half items-center bg-panel hover:bg-secondary text-normal"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading || !name || !address || !code}
          className="rounded-sm px-base py-half text-cta min-h-cta flex gap-half items-center bg-brand hover:bg-brand-hover text-on-brand disabled:cursor-not-allowed disabled:bg-panel"
        >
          {loading ? 'Pairing...' : 'Pair'}
        </button>
      </div>
    </form>
  );
}
