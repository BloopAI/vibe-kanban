import type { TelemetryStatus } from 'shared/types';

export interface FrontendTelemetryEnv {
  VITE_POSTHOG_API_KEY?: string;
  VITE_POSTHOG_API_ENDPOINT?: string;
  VITE_SENTRY_DSN?: string;
}

const isSet = (value: string | undefined) => Boolean(value?.trim());

/**
 * Whether usage analytics or crash reports can be sent, either by the
 * backend (as `/api/info` reports it) or by this frontend build.
 *
 * A missing backend status (still loading, or a server too old to report
 * it) counts as collecting, so the opt-out toggle stays available.
 */
export function collectsTelemetry(
  backend: TelemetryStatus | null | undefined,
  env: FrontendTelemetryEnv
): boolean {
  if (!backend) return true;
  return (
    backend.analytics ||
    backend.crash_reports ||
    (isSet(env.VITE_POSTHOG_API_KEY) && isSet(env.VITE_POSTHOG_API_ENDPOINT)) ||
    isSet(env.VITE_SENTRY_DSN)
  );
}
