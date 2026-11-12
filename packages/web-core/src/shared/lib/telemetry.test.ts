import { describe, it, expect } from 'vitest';
import { collectsTelemetry } from './telemetry';

const none = { analytics: false, crash_reports: false };

describe('collectsTelemetry', () => {
  it('is false when neither the backend nor the frontend has keys', () => {
    expect(collectsTelemetry(none, {})).toBe(false);
  });

  it('follows the backend even when the frontend has no keys', () => {
    expect(collectsTelemetry({ ...none, analytics: true }, {})).toBe(true);
    expect(collectsTelemetry({ ...none, crash_reports: true }, {})).toBe(true);
  });

  it('needs both PostHog key and endpoint in the frontend', () => {
    expect(collectsTelemetry(none, { VITE_POSTHOG_API_KEY: 'k' })).toBe(false);
    expect(
      collectsTelemetry(none, {
        VITE_POSTHOG_API_KEY: 'k',
        VITE_POSTHOG_API_ENDPOINT: 'https://e',
      })
    ).toBe(true);
  });

  it('counts a frontend Sentry DSN', () => {
    expect(collectsTelemetry(none, { VITE_SENTRY_DSN: 'https://dsn' })).toBe(
      true
    );
  });

  it('treats blank values as unset', () => {
    expect(
      collectsTelemetry(none, {
        VITE_POSTHOG_API_KEY: ' ',
        VITE_POSTHOG_API_ENDPOINT: ' ',
        VITE_SENTRY_DSN: '',
      })
    ).toBe(false);
  });

  it('keeps the toggle when the server does not report its status', () => {
    expect(collectsTelemetry(null, {})).toBe(true);
    expect(collectsTelemetry(undefined, {})).toBe(true);
  });
});
