import { useMemo } from "react";
import { useLocation } from "@tanstack/react-router";
import { SettingsDialog } from "@/shared/dialogs/settings/SettingsDialog";
import { REMOTE_SETTINGS_SECTIONS } from "@remote/shared/constants/settings";
import { parseRelayHostIdFromSearch } from "@remote/shared/lib/activeRelayHost";

interface BlockedHostState {
  id: string;
  name: string | null;
  errorMessage?: string | null;
}

interface WorkspacesUnavailablePageProps {
  blockedHost?: BlockedHostState;
  isCheckingBlockedHost?: boolean;
}

export default function WorkspacesUnavailablePage({
  blockedHost,
  isCheckingBlockedHost = false,
}: WorkspacesUnavailablePageProps) {
  const location = useLocation();

  const selectedHostId = useMemo(
    () => blockedHost?.id ?? parseRelayHostIdFromSearch(location.searchStr),
    [blockedHost?.id, location.searchStr],
  );

  const selectedHostName = useMemo(
    () => blockedHost?.name ?? selectedHostId,
    [blockedHost?.name, selectedHostId],
  );

  const isBlockedHostState = Boolean(blockedHost);

  const openRelaySettings = () => {
    void SettingsDialog.show({
      initialSection: "relay",
      sections: REMOTE_SETTINGS_SECTIONS,
    });
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl items-center justify-center px-double py-double">
      <div className="w-full space-y-base rounded-sm border border-border bg-secondary p-double">
        <h1 className="text-xl font-semibold text-high">Workspaces</h1>

        {isCheckingBlockedHost ? (
          <p className="text-sm text-low">
            Connecting to{" "}
            <span className="font-medium text-high">
              {selectedHostName ?? "selected host"}
            </span>
            ...
          </p>
        ) : isBlockedHostState ? (
          <div className="space-y-base">
            <div className="rounded-sm border border-warning/40 bg-warning/10 p-base">
              <p className="text-sm font-medium text-high">
                Could not connect to {selectedHostName ?? "the selected host"}.
              </p>
              <p className="mt-half text-sm text-low">
                This host is offline or no longer reachable from this browser.
              </p>
            </div>

            <ol className="list-inside list-decimal space-y-half text-sm text-low">
              <li>
                On that machine, open Vibe Kanban and confirm the host is
                online.
              </li>
              <li>
                If it still fails, open Relay Settings and pair this host again.
              </li>
            </ol>

            {blockedHost?.errorMessage && (
              <p className="break-all text-xs text-low">
                Last connection error: {blockedHost.errorMessage}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-low">
            Select an online host in the app bar to load local workspaces
            through relay.
          </p>
        )}

        <button
          type="button"
          onClick={openRelaySettings}
          className="rounded-sm border border-border bg-primary px-base py-half text-xs text-normal hover:border-brand/60"
        >
          Open Relay Settings
        </button>

        {isBlockedHostState && (
          <p className="text-sm text-low">
            After the host is online again, select it from the app bar and
            retry.
          </p>
        )}
      </div>
    </div>
  );
}
