import { useState, useMemo } from 'react';
import { Button } from '@vibe/ui/components/Button';
import { Input } from '@vibe/ui/components/Input';
import { Label } from '@vibe/ui/components/Label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@vibe/ui/components/KeyboardDialog';
import { Alert, AlertDescription } from '@vibe/ui/components/Alert';
import {
  SpinnerIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  LinkIcon,
  WarningCircle,
} from '@phosphor-icons/react';
import { create, useModal } from '@ebay/nice-modal-react';
import { defineModal } from '@/shared/lib/modals';
import {
  useMachineAcpRegistry,
  useMachineAcpServers,
  useMachineInstallFromRegistry,
  useMachineInstallCustom,
  useMachineUninstallAcpServer,
} from '@/shared/hooks/useAcpServers';
import type { RegistryEntryWithStatus } from '@/shared/lib/api';
import type { MachineClient } from '@/shared/lib/machineClient';
import { cn } from '@/shared/lib/utils';
import { AgentIcon } from '@/shared/components/AgentIcon';

export interface InstallAgentDialogProps {
  machineClient: MachineClient | null;
}

export type InstallAgentResult = {
  action: 'installed' | 'canceled';
  name?: string;
  command?: string;
};

type Tab = 'registry' | 'custom';

const InstallAgentDialogImpl = create<InstallAgentDialogProps>(
  ({ machineClient }) => {
    const modal = useModal();
    const [tab, setTab] = useState<Tab>('registry');
    const [search, setSearch] = useState('');

    // Custom form state
    const [customName, setCustomName] = useState('');
    const [customCommand, setCustomCommand] = useState('');
    const [customError, setCustomError] = useState<string | null>(null);

    // Per-entry loading state
    const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());

    const { data: registry, isLoading: registryLoading } =
      useMachineAcpRegistry(machineClient);
    const { data: installedServers } = useMachineAcpServers(machineClient);
    const installMutation = useMachineInstallFromRegistry(machineClient);
    const installCustomMutation = useMachineInstallCustom(machineClient);
    const uninstallMutation = useMachineUninstallAcpServer(machineClient);

    const filteredEntries = useMemo(() => {
      if (!registry) return [];
      if (!search.trim()) return registry;
      const q = search.toLowerCase();
      return registry.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q)
      );
    }, [registry, search]);

    const handleInstall = async (entry: RegistryEntryWithStatus) => {
      setLoadingIds((prev) => new Set(prev).add(entry.id));
      try {
        const result = await installMutation.mutateAsync(entry.id);
        modal.resolve({
          action: 'installed',
          name: result.name,
        } as InstallAgentResult);
        // Don't hide — user may want to install more
      } catch {
        // mutation error handled by react-query
      } finally {
        setLoadingIds((prev) => {
          const next = new Set(prev);
          next.delete(entry.id);
          return next;
        });
      }
    };

    const handleUninstall = async (entry: RegistryEntryWithStatus) => {
      const server = installedServers?.find(
        (s) => s.source.type === 'registry' && s.source.registry_id === entry.id
      );
      if (!server) return;
      setLoadingIds((prev) => new Set(prev).add(entry.id));
      try {
        await uninstallMutation.mutateAsync(server.name);
      } catch {
        // mutation error handled by react-query
      } finally {
        setLoadingIds((prev) => {
          const next = new Set(prev);
          next.delete(entry.id);
          return next;
        });
      }
    };

    const validateCustomName = (name: string): string | null => {
      const trimmed = name.trim();
      if (!trimmed) return 'Name is required';
      if (trimmed.length > 40) return 'Name must be 40 characters or less';
      if (!/^[A-Z0-9_]+$/.test(trimmed))
        return 'Name must be SCREAMING_SNAKE_CASE (A-Z, 0-9, _)';
      return null;
    };

    const handleInstallCustom = async () => {
      const normalized = customName
        .trim()
        .replace(/[\s-]+/g, '_')
        .toUpperCase();
      const nameError = validateCustomName(normalized);
      if (nameError) {
        setCustomError(nameError);
        return;
      }
      if (!customCommand.trim()) {
        setCustomError('Command is required');
        return;
      }
      try {
        await installCustomMutation.mutateAsync(normalized);
        modal.resolve({
          action: 'installed',
          name: normalized,
          command: customCommand.trim(),
        } as InstallAgentResult);
        modal.hide();
      } catch {
        setCustomError('Failed to install custom server');
      }
    };

    const handleCancel = () => {
      modal.resolve({ action: 'canceled' } as InstallAgentResult);
      modal.hide();
    };

    return (
      <Dialog
        open={modal.visible}
        onOpenChange={(open) => !open && handleCancel()}
      >
        <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Install Agent</DialogTitle>
            <DialogDescription>
              Browse available ACP servers or add a custom one.
            </DialogDescription>
          </DialogHeader>

          {/* Search + Tabs */}
          <div className="space-y-2">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-2 top-1/2 -translate-y-1/2 size-icon-xs text-low" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search agents..."
                className="pl-8"
              />
            </div>
            <div className="flex gap-1">
              <Button
                variant={tab === 'registry' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setTab('registry')}
              >
                Registry
              </Button>
              <Button
                variant={tab === 'custom' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setTab('custom')}
              >
                Custom
              </Button>
            </div>
          </div>

          {/* Tab content */}
          {tab === 'registry' && (
            <div className="flex-1 overflow-y-auto min-h-0 py-1">
              {registryLoading && (
                <div className="flex items-center justify-center py-8 text-low">
                  <SpinnerIcon className="size-icon-sm animate-spin" />
                </div>
              )}
              {!registryLoading && filteredEntries.length === 0 && (
                <p className="text-low text-sm text-center py-8">
                  No agents found.
                </p>
              )}
              {!registryLoading && filteredEntries.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {filteredEntries.map((entry) => (
                    <RegistryEntryRow
                      key={entry.id}
                      entry={entry}
                      loading={loadingIds.has(entry.id)}
                      onInstall={() => handleInstall(entry)}
                      onUninstall={() => handleUninstall(entry)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'custom' && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="custom-name">Server Name</Label>
                <Input
                  id="custom-name"
                  value={customName}
                  onChange={(e) => {
                    setCustomName(e.target.value);
                    setCustomError(null);
                  }}
                  placeholder="e.g., MY_CUSTOM_AGENT"
                  maxLength={40}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="custom-command">Command</Label>
                <Input
                  id="custom-command"
                  value={customCommand}
                  onChange={(e) => {
                    setCustomCommand(e.target.value);
                    setCustomError(null);
                  }}
                  placeholder="e.g., npx -y my-acp-server --acp"
                />
              </div>
              {customError && (
                <Alert variant="destructive">
                  <AlertDescription>{customError}</AlertDescription>
                </Alert>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={handleCancel}>
                  Cancel
                </Button>
                <Button
                  onClick={handleInstallCustom}
                  disabled={
                    !customName.trim() ||
                    !customCommand.trim() ||
                    installCustomMutation.isPending
                  }
                >
                  {installCustomMutation.isPending ? (
                    <SpinnerIcon className="size-icon-xs animate-spin mr-1" />
                  ) : null}
                  Install Custom
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    );
  }
);

function RegistryEntryRow({
  entry,
  loading,
  onInstall,
  onUninstall,
}: {
  entry: RegistryEntryWithStatus;
  loading: boolean;
  onInstall: () => void;
  onUninstall: () => void;
}) {
  const agentKey = entry.id.replace(/-/g, '_').toUpperCase();

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3 rounded-sm border border-border/50 bg-secondary/30',
        !entry.is_installed &&
          'hover:bg-secondary hover:border-border transition-colors'
      )}
    >
      <div className="w-6 h-6 rounded-sm border border-border bg-secondary flex items-center justify-center overflow-hidden shrink-0">
        <AgentIcon
          agent={agentKey}
          iconUrl={entry.icon ?? undefined}
          className="w-full h-full"
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1 min-w-0">
            <span className="text-sm font-medium text-normal truncate">
              {entry.name}
            </span>
            {entry.repository && (
              <a
                href={entry.repository}
                target="_blank"
                rel="noopener noreferrer"
                className="text-low hover:text-normal shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <LinkIcon className="size-icon-2xs" weight="bold" />
              </a>
            )}
          </span>
          {loading ? (
            <SpinnerIcon className="size-icon-xs animate-spin text-low shrink-0" />
          ) : entry.is_installed ? (
            <button
              onClick={onUninstall}
              className="text-xs text-low hover:text-error shrink-0"
            >
              Uninstall
            </button>
          ) : entry.supports_followup === false ? (
            <span
              title="This agent does not support follow-up messages"
              className="shrink-0"
            >
              <WarningCircle
                className="size-icon-xs text-error"
                weight="fill"
              />
            </span>
          ) : (
            <button onClick={onInstall}>
              <PlusIcon
                className="size-icon-xs text-low shrink-0 cursor-pointer"
                weight="bold"
              />
            </button>
          )}
        </div>
        <div className="text-xs text-low line-clamp-2 mt-half">
          {entry.description}
        </div>
      </div>
    </div>
  );
}

export const InstallAgentDialog = defineModal<
  InstallAgentDialogProps,
  InstallAgentResult
>(InstallAgentDialogImpl);
