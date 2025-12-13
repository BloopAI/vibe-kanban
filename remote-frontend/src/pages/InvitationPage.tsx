import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  getInvitation,
  initOAuth,
  type Invitation,
  type OAuthProvider,
} from "../api";
import {
  generateVerifier,
  generateChallenge,
  storeVerifier,
  storeInvitationToken,
} from "../pkce";

export default function InvitationPage() {
  const { token = "" } = useParams();
  const [data, setData] = useState<Invitation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getInvitation(token)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [token]);

  const handleOAuthLogin = async (provider: OAuthProvider) => {
    setLoading(true);
    try {
      const verifier = generateVerifier();
      const challenge = await generateChallenge(verifier);

      storeVerifier(verifier);
      storeInvitationToken(token);

      const appBase =
        import.meta.env.VITE_APP_BASE_URL || window.location.origin;
      const returnTo = `${appBase}/invitations/${token}/complete`;

      const result = await initOAuth(provider, returnTo, challenge);
      window.location.assign(result.authorize_url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "OAuth init failed");
      setLoading(false);
    }
  };

  if (error) {
    return <ErrorCard title="Invalid or expired invitation" body={error} />;
  }

  if (!data) {
    return <LoadingCard text="Loading invitation..." />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md bg-white shadow rounded-lg p-6 space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            You've been invited
          </h1>
          <p className="text-gray-600 mt-1">
            Join <span className="font-semibold">{data.organization_name}</span>
          </p>
        </div>

        <div className="border-t border-gray-200 pt-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Role:</span>
            <span className="font-medium text-gray-900">{data.role}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Expires:</span>
            <span className="font-medium text-gray-900">
              {new Date(data.expires_at).toLocaleDateString()}
            </span>
          </div>
        </div>

        <div className="border-t border-gray-200 pt-4 space-y-3">
          <p className="text-sm text-gray-600">
            Choose a provider to continue:
          </p>
          <OAuthButton
            label="Continue with GitHub"
            onClick={() => handleOAuthLogin("github")}
            disabled={loading}
          />
          <OAuthButton
            label="Continue with Google"
            onClick={() => handleOAuthLogin("google")}
            disabled={loading}
          />
        </div>
      </div>
    </div>
  );
}

function OAuthButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full py-3 px-4 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {label}
    </button>
  );
}

function LoadingCard({ text }: { text: string }) {
  return (
    <div className="min-h-screen grid place-items-center bg-gray-50">
      <div className="text-gray-600">{text}</div>
    </div>
  );
}

function ErrorCard({ title, body }: { title: string; body?: string }) {
  return (
    <div className="min-h-screen grid place-items-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-semibold text-red-600">{title}</h2>
        {body && <p className="text-gray-600 mt-2">{body}</p>}
      </div>
    </div>
  );
}
