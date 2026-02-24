import { Link } from "@tanstack/react-router";

export default function UpgradeSuccessPage() {
  return (
    <div className="h-screen overflow-auto bg-primary">
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-base py-double">
        <div className="rounded-sm border border-border bg-secondary p-double text-center">
          <h1 className="text-xl font-semibold text-high">Upgrade Complete</h1>
          <p className="mt-base text-sm text-normal">
            Your subscription is now active.
          </p>
          <p className="mt-base text-sm text-low">
            Continue in the web app, or return to your desktop app to keep
            working.
          </p>

          <Link
            to="/"
            className="mt-double block w-full rounded-sm bg-brand px-base py-half text-sm font-medium text-on-brand transition-colors hover:bg-brand-hover"
          >
            Go to Organizations
          </Link>
        </div>
      </div>
    </div>
  );
}
