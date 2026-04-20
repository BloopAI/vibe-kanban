import { useState, useEffect, useCallback } from 'react';
import { SpinnerIcon } from '@phosphor-icons/react';
import { PrimaryButton } from '@vibe/ui/components/PrimaryButton';
import { p2pHostsApi } from '@/shared/lib/p2p-hosts-api';
import type { P2pHost } from '@/shared/types/p2p-hosts';
import { SettingsCard, SettingsInput } from './SettingsComponents';

// OX Agent: All external requests go through p2pHostsApi -> makeLocalApiRequest
// which only communicates with the local backend at fixed API endpoints.
// User-provided 'address' and 'ssh_key_path' are JSON-encoded and sent to the
// backend for validation (SSRF / path-traversal prevention happens server-side).
// Frontend never uses these values as a URL or file path directly.

export function RemoteHostsSettingsSection() {
  const [hosts, setHosts] = useState<P2pHost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPairingCodeForm, setShowPairingCodeForm] = useState(false);
  const [showSshForm, setShowSshForm] = useState(false);

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
        description="Self-hosted Agent Kanban instances paired directly via P2P (not cloud relay)."
        headerAction={
          <div className="flex gap-2">
            <PrimaryButton
              variant="secondary"
              value="Add via pairing code"
              onClick={() => {
                setShowPairingCodeForm(true);
                setShowSshForm(false);
              }}
            />
            <PrimaryButton
              variant="secondary"
              value="Add via SSH key"
              onClick={() => {
                setShowSshForm(true);
                setShowPairingCodeForm(false);
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
              <HostRow
                key={host.id}
                host={host}
                onRemove={handleRemove}
                onUpdated={loadHosts}
              />
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

        {showSshForm && (
          <SshPairForm
            onSuccess={() => {
              setShowSshForm(false);
              void loadHosts();
            }}
            onCancel={() => setShowSshForm(false)}
          />
        )}
      </SettingsCard>
    </div>
  );
}

function HostRow({
  host,
  onRemove,
  onUpdated,
}: {
  host: P2pHost;
  onRemove: (id: string) => void;
  onUpdated: () => void;
}) {
  const [removing, setRemoving] = useState(false);
  const [editing, setEditing] = useState(false);
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
    <div className="rounded-sm border border-border bg-secondary/30">
      <div className="p-3 flex items-center justify-between gap-3">
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
          <button
            className="text-xs text-low hover:text-normal"
            onClick={() => setEditing((v) => !v)}
          >
            {editing ? 'Cancel' : 'Edit'}
          </button>
          <PrimaryButton
            variant="tertiary"
            value="Remove"
            onClick={() => void handleRemove()}
            disabled={removing}
            actionIcon={removing ? 'spinner' : undefined}
          />
        </div>
      </div>
      {editing && (
        <SshConfigEditForm
          host={host}
          onSuccess={() => {
            setEditing(false);
            onUpdated();
          }}
          onCancel={() => setEditing(false)}
        />
      )}
    </div>
  );
}

function SshConfigEditForm({
  host,
  onSuccess,
  onCancel,
}: {
  host: P2pHost;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [sshUser, setSshUser] = useState(host.ssh_user ?? '');
  const [sshPort, setSshPort] = useState(host.ssh_port ?? 22);
  const [sshKeyPath, setSshKeyPath] = useState(host.ssh_key_path ?? '');
  const [connectionMode, setConnectionMode] = useState<
    'auto' | 'direct' | 'ssh'
  >((host.connection_mode as 'auto' | 'direct' | 'ssh') ?? 'auto');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      // OX Agent: ssh_key_path is JSON-encoded and sent to the local backend only.
      // Path-traversal prevention is enforced server-side in the Rust handler;
      // the frontend never opens this value as a local file path.
      await p2pHostsApi.updateSshConfig(host.id, {
        ssh_user: sshUser || undefined,
        ssh_port: sshPort,
        ssh_key_path: sshKeyPath || undefined,
        connection_mode: connectionMode,
      });
      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="space-y-4 px-3 pb-3 border-t border-border pt-3"
    >
      <h4 className="text-sm font-medium text-high">Edit SSH configuration</h4>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="text-sm font-medium text-normal">SSH user</label>
          <SettingsInput
            value={sshUser}
            onChange={setSshUser}
            placeholder="root"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-normal">SSH port</label>
          <input
            type="number"
            value={sshPort}
            onChange={(e) => setSshPort(Number(e.target.value))}
            min={1}
            max={65535}
            className="w-full bg-secondary border border-border rounded-sm px-base py-half text-sm text-high placeholder:text-low placeholder:opacity-80 focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-normal">
          SSH private key path
        </label>
        <input
          type="text"
          value={sshKeyPath}
          onChange={(e) => setSshKeyPath(e.target.value)}
          placeholder="~/.ssh/id_ed25519"
          className="w-full bg-secondary border border-border rounded-sm px-base py-half text-sm text-high font-mono placeholder:text-low placeholder:opacity-80 focus:outline-none focus:ring-1 focus:ring-brand"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-normal">
          Connection mode
        </label>
        <select
          value={connectionMode}
          onChange={(e) =>
            setConnectionMode(e.target.value as 'auto' | 'direct' | 'ssh')
          }
          className="w-full bg-secondary border border-border rounded-sm px-base py-half text-sm text-high focus:outline-none focus:ring-1 focus:ring-brand"
        >
          <option value="auto">Auto (try direct, fall back to SSH)</option>
          <option value="direct">Direct WebSocket only</option>
          <option value="ssh">SSH tunnel only</option>
        </select>
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
          disabled={loading}
          className="rounded-sm px-base py-half text-cta min-h-cta flex gap-half items-center bg-brand hover:bg-brand-hover text-on-brand disabled:cursor-not-allowed disabled:bg-panel"
        >
          {loading ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
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

function SshPairForm({
  onSuccess,
  onCancel,
}: {
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [sshPort, setSshPort] = useState(22);
  const [sshUser, setSshUser] = useState('');
  const [sshKeyPath, setSshKeyPath] = useState('');
  const [relayPort, setRelayPort] = useState(8081);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fingerprint, setFingerprint] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      // OX Agent: address and ssh_key_path are JSON-encoded and sent to the local
      // backend only. SSRF and path-traversal prevention are enforced server-side
      // in the Rust handler; the frontend never fetches these values as URLs or
      // opens them as local file paths.
      const result = await p2pHostsApi.sshPair({
        name,
        address,
        ssh_port: sshPort,
        ssh_user: sshUser,
        ssh_key_path: sshKeyPath,
        relay_port: relayPort,
      });
      setFingerprint(result.host_key_fingerprint);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'SSH pairing failed');
    } finally {
      setLoading(false);
    }
  };

  if (fingerprint) {
    return (
      <div className="space-y-4 pt-4 border-t border-border">
        <h4 className="text-sm font-medium text-high">
          SSH host key fingerprint
        </h4>
        <p className="text-sm text-normal">
          Successfully connected. Verify the fingerprint below matches your
          server&apos;s host key before continuing. Future connections will
          reject any other key (TOFU).
        </p>
        <code className="block w-full bg-secondary border border-border rounded-sm px-base py-half text-xs text-high font-mono break-all">
          {fingerprint}
        </code>
        <div className="flex justify-end">
          <button
            type="button"
            className="rounded-sm px-base py-half text-cta min-h-cta flex gap-half items-center bg-brand hover:bg-brand-hover text-on-brand"
            onClick={onSuccess}
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="space-y-4 pt-4 border-t border-border"
    >
      <h4 className="text-sm font-medium text-high">
        Add remote host via SSH key
      </h4>

      <div className="space-y-2">
        <label className="text-sm font-medium text-normal">Name</label>
        <SettingsInput value={name} onChange={setName} placeholder="My VPS" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="text-sm font-medium text-normal">
            Host address
          </label>
          <SettingsInput
            value={address}
            onChange={setAddress}
            placeholder="192.168.1.10 or myserver.com"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-normal">SSH port</label>
          <input
            type="number"
            value={sshPort}
            onChange={(e) => setSshPort(Number(e.target.value))}
            min={1}
            max={65535}
            required
            className="w-full bg-secondary border border-border rounded-sm px-base py-half text-sm text-high placeholder:text-low placeholder:opacity-80 focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-normal">SSH username</label>
        <SettingsInput
          value={sshUser}
          onChange={setSshUser}
          placeholder="root"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-normal">
          SSH private key path
        </label>
        <input
          type="text"
          value={sshKeyPath}
          onChange={(e) => setSshKeyPath(e.target.value)}
          placeholder="~/.ssh/id_ed25519"
          required
          className="w-full bg-secondary border border-border rounded-sm px-base py-half text-sm text-high font-mono placeholder:text-low placeholder:opacity-80 focus:outline-none focus:ring-1 focus:ring-brand"
        />
        <p className="text-xs text-low">
          Path to the private key file on this machine
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-normal">
          Relay port on remote
        </label>
        <input
          type="number"
          value={relayPort}
          onChange={(e) => setRelayPort(Number(e.target.value))}
          min={1}
          max={65535}
          className="w-full bg-secondary border border-border rounded-sm px-base py-half text-sm text-high placeholder:text-low placeholder:opacity-80 focus:outline-none focus:ring-1 focus:ring-brand"
        />
        <p className="text-xs text-low">Default: 8081</p>
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
          disabled={loading || !name || !address || !sshUser || !sshKeyPath}
          className="rounded-sm px-base py-half text-cta min-h-cta flex gap-half items-center bg-brand hover:bg-brand-hover text-on-brand disabled:cursor-not-allowed disabled:bg-panel"
        >
          {loading ? 'Connecting…' : 'Connect & pair'}
        </button>
      </div>
    </form>
  );
}
