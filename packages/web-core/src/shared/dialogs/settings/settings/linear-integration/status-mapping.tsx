import { useEffect, useState } from 'react';
import { SpinnerIcon } from '@phosphor-icons/react';
import { Button } from '@vibe/ui/components/Button';
import { cn } from '@/shared/lib/utils';
import { makeRequest } from '@/shared/lib/remoteApi';

interface VkStatus {
  id: string;
  name: string;
  color: string;
}

interface LinearState {
  id: string;
  name: string;
}

interface Mapping {
  vkStatusId: string;
  linearStateId: string;
  linearStateName: string;
}

interface Props {
  connectionId: string;
  vkStatuses: VkStatus[];
}

export function StatusMappingPanel({ connectionId, vkStatuses }: Props) {
  const [linearStates, setLinearStates] = useState<LinearState[]>([]);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      makeRequest(
        `/v1/linear/connections/${connectionId}/status-mappings`
      ).then((r) => r.json()),
      makeRequest(
        `/v1/linear/connections/${connectionId}/workflow-states`
      ).then((r) => r.json()),
    ])
      .then(([savedMappings, states]) => {
        const map: Record<string, string> = {};
        (savedMappings as Mapping[]).forEach((m) => {
          map[m.vkStatusId] = m.linearStateId;
        });
        setMappings(map);
        setLinearStates(states as LinearState[]);
      })
      .catch(() => setError('Failed to load status mappings'))
      .finally(() => setLoading(false));
  }, [connectionId]);

  async function save() {
    setSaving(true);
    setError('');
    setSaved(false);
    const mappingsList = Object.entries(mappings).map(
      ([vkStatusId, linearStateId]) => ({
        vkStatusId,
        linearStateId,
        linearStateName:
          linearStates.find((s) => s.id === linearStateId)?.name ?? '',
      })
    );
    try {
      await makeRequest(
        `/v1/linear/connections/${connectionId}/status-mappings`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mappings: mappingsList }),
        }
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError('Failed to save mappings');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-2">
        <SpinnerIcon
          className="size-icon-xs animate-spin text-low"
          weight="bold"
        />
        <span className="text-sm text-low">Loading states&hellip;</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium text-normal">Status Mapping</p>
        <p className="text-sm text-low mt-0.5">
          Map Vibe Kanban statuses to Linear workflow states.
        </p>
      </div>

      {error && <p className="text-sm text-error">{error}</p>}

      <div className="rounded-sm border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-secondary/50 border-b border-border">
              <th className="text-left px-base py-half text-xs font-medium text-low">
                Vibe Kanban Status
              </th>
              <th className="text-left px-base py-half text-xs font-medium text-low">
                Linear Workflow State
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {vkStatuses.map((status) => (
              <tr key={status.id}>
                <td className="px-base py-half">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block size-dot rounded-full shrink-0"
                      style={{ backgroundColor: `hsl(${status.color})` }}
                    />
                    <span className="text-sm text-high">{status.name}</span>
                  </div>
                </td>
                <td className="px-base py-half">
                  <select
                    value={mappings[status.id] ?? ''}
                    onChange={(e) =>
                      setMappings((m) => ({
                        ...m,
                        [status.id]: e.target.value,
                      }))
                    }
                    className={cn(
                      'w-full bg-secondary border border-border rounded-sm px-2 py-1 text-xs text-high',
                      'focus:outline-none focus:ring-1 focus:ring-brand'
                    )}
                  >
                    <option value="">-- unmapped --</option>
                    {linearStates.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => void save()}
          disabled={saving}
        >
          {saving && (
            <SpinnerIcon
              className="size-icon-xs mr-1 animate-spin"
              weight="bold"
            />
          )}
          {saving ? 'Saving\u2026' : 'Save mappings'}
        </Button>
        {saved && <span className="text-xs text-success">Mappings saved.</span>}
      </div>
    </div>
  );
}
