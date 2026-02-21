import { useEffect, useState } from "react";
import { isLoggedIn } from "../auth";
import {
  createRelaySession,
  createRelaySessionAuthCode,
  initOAuth,
  listRelayHosts,
  type OAuthProvider,
} from "../api";
import { generateVerifier, generateChallenge, storeVerifier } from "../pkce";

export default function RelayPage() {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [oauthLoading, setOauthLoading] = useState(false);

  useEffect(() => {
    if (isLoggedIn()) {
      setAuthenticated(true);
      checkRelay();
    } else {
      setLoading(false);
    }
  }, []);

  async function checkRelay() {
    try {
      const { hosts } = await listRelayHosts();
      const connectedHost = hosts.find((host) => host.status === "online");
      if (!connectedHost) {
        setLoading(false);
        return;
      }

      const { session } = await createRelaySession(connectedHost.id);
      const { relay_url, code } = await createRelaySessionAuthCode(session.id);

      // Exchange one-time code for relay cookie on the relay subdomain.
      const url = new URL(relay_url);
      url.searchParams.set("code", code);
      window.location.href = url.toString();
      return;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to check relay");
    }
    setLoading(false);
  }

  const handleOAuthLogin = async (provider: OAuthProvider) => {
    setOauthLoading(true);
    try {
      const verifier = generateVerifier();
      const challenge = await generateChallenge(verifier);
      storeVerifier(verifier);

      const appBase =
        import.meta.env.VITE_APP_BASE_URL || window.location.origin;
      const returnTo = `${appBase}/account/complete`;

      const result = await initOAuth(provider, returnTo, challenge);
      window.location.assign(result.authorize_url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "OAuth init failed");
      setOauthLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-gray-50">
        <div className="text-gray-600">Connecting...</div>
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

  // Authenticated but relay not connected
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md bg-white shadow rounded-lg p-6 space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Not Connected</h1>
          <p className="text-gray-600 mt-1">
            Your local Vibe Kanban instance isn't connected.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-sm text-gray-700 mb-2">
            Start your local server with relay mode enabled and the host ID:
          </p>
          <code className="block bg-gray-900 text-green-400 rounded px-3 py-2 text-sm font-mono">
            VK_TUNNEL=1 VK_TUNNEL_HOST_ID=&lt;host-id&gt; vibe-kanban
          </code>
        </div>

        <button
          onClick={() => {
            setLoading(true);
            setError(null);
            checkRelay();
          }}
          className="w-full py-2 px-4 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors font-medium"
        >
          Retry
        </button>
      </div>
    </div>
  );
}
