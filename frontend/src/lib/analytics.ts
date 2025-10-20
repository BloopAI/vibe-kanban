import posthog from 'posthog-js';
import type { AnalyticsInfo } from 'shared/types';

let posthogInitialized = false;
let analyticsEnabled = false;
let eventQueue: Array<{ eventName: string; properties?: Record<string, any> }> =
  [];

/**
 * Initialize PostHog with analytics configuration from the backend
 * @param analyticsInfo - Analytics configuration including user_id, api_key, and endpoint from backend
 * @param userAnalyticsEnabled - Whether the user has opted in to analytics (from config.analytics_enabled)
 */
export function initializeAnalytics(
  analyticsInfo: AnalyticsInfo | null,
  userAnalyticsEnabled: boolean
): void {
  // Check if user has explicitly opted out (opt-out by default: track unless explicitly false)
  if (userAnalyticsEnabled === false) {
    console.log('[Analytics] Analytics disabled by user preference');
    analyticsEnabled = false;

    // If PostHog is already initialized, opt out
    if (posthogInitialized) {
      posthog.opt_out_capturing();
    }
    return;
  }

  if (!analyticsInfo || !analyticsInfo.config) {
    console.warn('[Analytics] No PostHog configuration available from backend');
    analyticsEnabled = false;
    return;
  }

  // If already initialized, just opt in and we're done
  if (posthogInitialized) {
    posthog.opt_in_capturing();
    analyticsEnabled = true;
    console.log('[Analytics] Analytics re-enabled');
    return;
  }

  // Initialize PostHog for the first time
  try {
    posthog.init(analyticsInfo.config.posthog_api_key, {
      api_host: analyticsInfo.config.posthog_api_endpoint,
      loaded: () => {
        console.log('[Analytics] PostHog initialized successfully');

        // Identify user with backend's user_id for correlation
        posthog.identify(analyticsInfo.user_id);

        analyticsEnabled = true;

        // Flush queued events
        if (eventQueue.length > 0) {
          console.log(
            `[Analytics] Flushing ${eventQueue.length} queued events`
          );
          eventQueue.forEach(({ eventName, properties }) => {
            posthog.capture(eventName, {
              ...properties,
              timestamp: new Date().toISOString(),
              source: 'frontend',
            });
          });
          eventQueue = [];
        }
      },
      capture_pageview: false,
      capture_pageleave: true,
      capture_performance: true, // Track web vitals (LCP, FID, CLS, etc.)
      autocapture: false, // Disabled - we use manual events only
    });
    posthogInitialized = true;
  } catch (error) {
    console.error('[Analytics] Failed to initialize PostHog:', error);
    analyticsEnabled = false;
  }
}

/**
 * Track a custom event
 */
export function trackEvent(
  eventName: string,
  properties?: Record<string, any>
): void {
  // If PostHog is initializing but not ready yet, queue the event
  if (posthogInitialized && !analyticsEnabled) {
    eventQueue.push({ eventName, properties });
    return;
  }

  if (!analyticsEnabled) {
    return;
  }

  try {
    posthog.capture(eventName, {
      ...properties,
      timestamp: new Date().toISOString(),
      source: 'frontend',
    });
  } catch (error) {
    console.error('[Analytics] Failed to track event:', eventName, error);
  }
}

/**
 * Identify a user (for when we have user information)
 */
export function identifyUser(
  userId: string,
  properties?: Record<string, any>
): void {
  if (!analyticsEnabled) {
    return;
  }

  try {
    posthog.identify(userId, properties);
  } catch (error) {
    console.error('[Analytics] Failed to identify user:', error);
  }
}

/**
 * Track a page view
 */
export function trackPageView(pageName?: string): void {
  if (!analyticsEnabled) {
    return;
  }

  try {
    posthog.capture('$pageview', pageName ? { page: pageName } : undefined);
  } catch (error) {
    console.error('[Analytics] Failed to track page view:', error);
  }
}

/**
 * Reset analytics (e.g., on logout)
 */
export function resetAnalytics(): void {
  if (!analyticsEnabled) {
    return;
  }

  try {
    posthog.reset();
  } catch (error) {
    console.error('[Analytics] Failed to reset analytics:', error);
  }
}

/**
 * Check if analytics is enabled
 */
export function isAnalyticsEnabled(): boolean {
  return analyticsEnabled;
}
