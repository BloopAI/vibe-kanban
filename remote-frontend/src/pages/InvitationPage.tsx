import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getInvitation, buildAcceptUrl, type Invitation } from '../api'

export default function InvitationPage() {
  const { token = '' } = useParams()
  const [data, setData] = useState<Invitation | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getInvitation(token)
      .then(setData)
      .catch((e) => setError(e.message))
  }, [token])

  if (error) {
    return (
      <ErrorCard
        title="Invalid or expired invitation"
        body={error}
      />
    )
  }

  if (!data) {
    return <LoadingCard text="Loading invitation..." />
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md bg-white shadow rounded-lg p-6 space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            You've been invited
          </h1>
          <p className="text-gray-600 mt-1">
            Join the <span className="font-semibold">{data.organization_slug}</span> organization
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
            onClick={() => window.location.assign(buildAcceptUrl(token, 'github'))}
          />
          <OAuthButton
            label="Continue with Google"
            onClick={() => window.location.assign(buildAcceptUrl(token, 'google'))}
          />
        </div>
      </div>
    </div>
  )
}

function OAuthButton({
  label,
  onClick,
}: {
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="w-full py-3 px-4 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors font-medium"
    >
      {label}
    </button>
  )
}

function LoadingCard({ text }: { text: string }) {
  return (
    <div className="min-h-screen grid place-items-center bg-gray-50">
      <div className="text-gray-600">{text}</div>
    </div>
  )
}

function ErrorCard({ title, body }: { title: string; body?: string }) {
  return (
    <div className="min-h-screen grid place-items-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-semibold text-red-600">{title}</h2>
        {body && <p className="text-gray-600 mt-2">{body}</p>}
      </div>
    </div>
  )
}
