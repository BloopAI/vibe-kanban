import { useMemo } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { SettingsDialog } from "@/shared/dialogs/settings/SettingsDialog";
import { REMOTE_SETTINGS_SECTIONS } from "@remote/shared/constants/settings";
import { useRelayAppBarHosts } from "@remote/shared/hooks/useRelayAppBarHosts";
import { parseRelayHostIdFromSearch } from "@remote/shared/lib/activeRelayHost";

export default function WorkspacesUnavailablePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { hosts, isLoading } = useRelayAppBarHosts(true);

  const selectedHostId = useMemo(
    () => parseRelayHostIdFromSearch(location.searchStr),
    [location.searchStr],
  );

  const onlineHosts = useMemo(
    () => hosts.filter((host) => host.status === "online"),
    [hosts],
  );

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl items-center justify-center px-double py-double">
      <div className="w-full space-y-base rounded-sm border border-border bg-secondary p-double">
        <h1 className="text-xl font-semibold text-high">Workspaces</h1>

        <p className="text-sm text-low">
          Connect an online host in the app bar to load local workspaces through
          relay.
        </p>

        {isLoading ? (
          <p className="text-sm text-low">Loading hosts...</p>
        ) : onlineHosts.length > 0 ? (
          <div className="flex flex-wrap gap-half">
            {onlineHosts.map((host) => (
              <button
                key={host.id}
                type="button"
                onClick={() => {
                  navigate({ to: "/workspaces", search: { hostId: host.id } });
                }}
                className={`rounded-sm border px-base py-half text-xs transition-colors ${
                  host.id === selectedHostId
                    ? "border-brand bg-brand/10 text-high"
                    : "border-border bg-primary text-normal hover:border-brand/60"
                }`}
              >
                {host.name}
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-half">
            <p className="text-sm text-low">
              No online paired hosts are available right now.
            </p>
            <button
              type="button"
              onClick={() => {
                void SettingsDialog.show({
                  initialSection: "relay",
                  sections: REMOTE_SETTINGS_SECTIONS,
                });
              }}
              className="rounded-sm border border-border bg-primary px-base py-half text-xs text-normal hover:border-brand/60"
            >
              Open Relay Settings
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
