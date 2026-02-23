import { useEffect, useMemo, useState } from "react";
import { currentRelativePath, isLoggedIn } from "../auth";
import {
  createRelaySession,
  createRelaySessionAuthCode,
  initOAuth,
  listRelayHosts,
  type OAuthProvider,
} from "../api";
import { generateVerifier, generateChallenge, storeVerifier } from "../pkce";

const HOST_POLL_INTERVAL_MS = 5000;

type RelayHosts = Awaited<ReturnType<typeof listRelayHosts>>["hosts"];

export default function RelayPage() {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [hosts, setHosts] = useState<RelayHosts>([]);
  const [selectedHostId, setSelectedHostId] = useState<string | null>(null);
  const [connectingHostId, setConnectingHostId] = useState<string | null>(null);
  const [autoConnectAttempted, setAutoConnectAttempted] = useState(false);

  const selectedHost = useMemo(
    () => hosts.find((host) => host.id === selectedHostId) ?? null,
    [hosts, selectedHostId],
  );

  useEffect(() => {
    if (!isLoggedIn()) {
      setLoading(false);
      return;
    }

    setAuthenticated(true);
    void refreshHosts();

    const timer = window.setInterval(() => {
      void refreshHosts({ silent: true });
    }, HOST_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (hosts.length === 0) {
      setSelectedHostId(null);
      return;
    }

    if (!selectedHostId || !hosts.some((host) => host.id === selectedHostId)) {
      const preferred =
        hosts.find((host) => host.status === "online") ?? hosts[0];
      setSelectedHostId(preferred.id);
    }
  }, [hosts, selectedHostId]);

  useEffect(() => {
    if (!authenticated || autoConnectAttempted || hosts.length === 0) {
      return;
    }

    const hostId = new URLSearchParams(window.location.search).get("host_id");
    if (!hostId) {
      return;
    }

    setAutoConnectAttempted(true);

    const host = hosts.find((item) => item.id === hostId);
    if (!host) {
      setError("Requested host was not found.");
      return;
    }

    setSelectedHostId(host.id);

    if (host.status !== "online") {
      setError("Requested host is currently offline.");
      return;
    }

    void connectToHost(host.id);
  }, [authenticated, autoConnectAttempted, hosts]);

  async function refreshHosts({ silent = false }: { silent?: boolean } = {}) {
    if (!silent) {
      setLoading(true);
    }

    try {
      const { hosts } = await listRelayHosts();
      setHosts(hosts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to list relay hosts");
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }

  async function connectToHost(hostId: string) {
    setError(null);
    setConnectingHostId(hostId);

    try {
      const { session } = await createRelaySession(hostId);
      const { relay_url, code } = await createRelaySessionAuthCode(session.id);

      // Exchange one-time code for relay cookie on the relay subdomain.
      const url = new URL(relay_url);
      url.searchParams.set("code", code);
      window.location.href = url.toString();
      return;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to connect to relay host",
      );
      setConnectingHostId(null);
    }
  }

  const handleOAuthLogin = async (provider: OAuthProvider) => {
    setOauthLoading(true);
    try {
      const verifier = generateVerifier();
      const challenge = await generateChallenge(verifier);
      storeVerifier(verifier);

      const appBase =
        import.meta.env.VITE_APP_BASE_URL || window.location.origin;
      const returnTo = new URL("/account/complete", appBase);
      returnTo.searchParams.set("next", currentRelativePath());

      const result = await initOAuth(provider, returnTo.toString(), challenge);
      window.location.assign(result.authorize_url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "OAuth init failed");
      setOauthLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-gray-50">
        <div className="text-gray-600">Loading relay hosts...</div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-md bg-white shadow rounded-lg p-6 space-y-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Remote Access</h1>
            <p className="text-gray-600 mt-1">
              Sign in to access your local Vibe Kanban remotely
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <div className="border-t border-gray-200 pt-4 space-y-3">
            <button
              onClick={() => handleOAuthLogin("github")}
              disabled={oauthLoading}
              className="w-full py-3 px-4 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Continue with GitHub
            </button>
            <button
              onClick={() => handleOAuthLogin("google")}
              disabled={oauthLoading}
              className="w-full py-3 px-4 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Continue with Google
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-2xl bg-white shadow rounded-lg p-6 space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Choose Host</h1>
          <p className="text-gray-600 mt-1">
            Select the local Vibe Kanban instance you want to open.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {hosts.length === 0 ? (
          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <p className="text-sm text-gray-700">
              No relay hosts are registered yet.
            </p>
            <p className="text-sm text-gray-700">
              Start your local server with relay mode enabled:
            </p>
            <code className="block bg-gray-900 text-green-400 rounded px-3 py-2 text-sm font-mono">
              VK_TUNNEL=1 vibe-kanban
            </code>
          </div>
        ) : (
          <div className="space-y-3">
            {hosts.map((host) => {
              const isSelected = host.id === selectedHostId;
              const isOnline = host.status === "online";
              return (
                <button
                  key={host.id}
                  onClick={() => setSelectedHostId(host.id)}
                  className={`w-full border rounded-lg p-3 text-left transition-colors ${
                    isSelected
                      ? "border-gray-900 bg-gray-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate">
                        {host.name}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {host.id}
                      </p>
                    </div>
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        isOnline
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {isOnline ? "online" : "offline"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => {
              setError(null);
              void refreshHosts();
            }}
            className="px-4 py-2 bg-white border border-gray-300 text-gray-800 rounded-lg hover:bg-gray-50 transition-colors font-medium"
          >
            Refresh
          </button>
          <button
            onClick={() => {
              if (selectedHostId) {
                void connectToHost(selectedHostId);
              }
            }}
            disabled={
              !selectedHost ||
              selectedHost.status !== "online" ||
              connectingHostId === selectedHost.id
            }
            className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {selectedHost && connectingHostId === selectedHost.id
              ? "Connecting..."
              : "Connect"}
          </button>
        </div>
      </div>
    </div>
  );
}
