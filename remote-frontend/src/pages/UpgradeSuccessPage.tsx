import { Link } from "@tanstack/react-router";

export default function UpgradeSuccessPage() {
  return (
    <div className="min-h-screen grid place-items-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white shadow rounded-lg p-6 text-center">
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
            <svg
              className="w-8 h-8 text-green-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
        </div>
        <h2 className="text-xl font-bold text-gray-900">Upgrade Complete!</h2>
        <p className="text-gray-600 mt-2">
          Your subscription has been activated successfully.
        </p>
        <div className="mt-6 space-y-3">
          <Link
            to="/account"
            className="block w-full py-2 px-4 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors font-medium text-center"
          >
            Go to Account
          </Link>
        </div>
      </div>
    </div>
  );
}
