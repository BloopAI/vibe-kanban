import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { getBillingStatus, type BillingStatusResponse } from "../api";
import { isLoggedIn } from "../auth";

export default function UpgradeSuccessPage() {
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const orgId = searchParams.get("org_id");

  useEffect(() => {
    const checkBillingStatus = async () => {
      if (!orgId) {
        setError("No organization specified");
        setLoading(false);
        return;
      }

      if (!isLoggedIn()) {
        setError("You must be logged in to view this page");
        setLoading(false);
        return;
      }

      try {
        const billing: BillingStatusResponse = await getBillingStatus(orgId);

        if (
          billing.billing_enabled &&
          billing.seat_info?.subscription &&
          billing.status === "active"
        ) {
          setSuccess(true);
        } else {
          setError(
            "Your subscription could not be verified. Please try again or contact support.",
          );
        }
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : "Failed to verify subscription status",
        );
      } finally {
        setLoading(false);
      }
    };

    checkBillingStatus();
  }, [orgId]);

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white shadow rounded-lg p-6 text-center">
          <div className="flex justify-center mb-4">
            <svg
              className="animate-spin h-8 w-8 text-gray-600"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900">
            Verifying your subscription...
          </h2>
          <p className="text-gray-600 mt-2">
            Please wait while we confirm your payment.
          </p>
        </div>
      </div>
    );
  }

  if (success) {
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
            Your subscription has been activated successfully. You can now enjoy
            all Pro features.
          </p>
          <div className="mt-6 space-y-3">
            <Link
              to={`/account/organizations/${orgId}`}
              className="block w-full py-2 px-4 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors font-medium text-center"
            >
              Go to Organization
            </Link>
            <Link
              to="/account"
              className="block w-full py-2 px-4 text-gray-600 hover:text-gray-900 text-sm"
            >
              Return to Account
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen grid place-items-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white shadow rounded-lg p-6 text-center">
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
            <svg
              className="w-8 h-8 text-red-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>
        </div>
        <h2 className="text-xl font-bold text-gray-900">
          Something went wrong
        </h2>
        <p className="text-gray-600 mt-2">{error}</p>
        <div className="mt-6 space-y-3">
          <Link
            to={orgId ? `/upgrade?org_id=${orgId}` : "/upgrade"}
            className="block w-full py-2 px-4 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors font-medium text-center"
          >
            Try Again
          </Link>
          <Link
            to="/account"
            className="block w-full py-2 px-4 text-gray-600 hover:text-gray-900 text-sm"
          >
            Return to Account
          </Link>
        </div>
      </div>
    </div>
  );
}
