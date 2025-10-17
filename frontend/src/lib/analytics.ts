import posthog from 'posthog-js';

let isInitialized = false;
let analyticsEnabled = false;

/**
 * Initialize PostHog with user's analytics preference
 * @param userAnalyticsEnabled - Whether the user has opted in to analytics (from config)
 */
export function initializeAnalytics(userAnalyticsEnabled: boolean): void {
  if (isInitialized) {
    return;
  }

  // Get PostHog credentials from Vite env variables
  const posthogApiKey = import.meta.env.VITE_POSTHOG_API_KEY;
  const posthogApiEndpoint = import.meta.env.VITE_POSTHOG_API_ENDPOINT;

  // Check if user has explicitly opted out (opt-out by default: track unless explicitly false)
  if (userAnalyticsEnabled === false) {
    console.log('[Analytics] Analytics disabled by user preference');
    analyticsEnabled = false;
    isInitialized = true;
    return;
  }

  if (!posthogApiKey || !posthogApiEndpoint) {
    console.log('[Analytics] Missing PostHog configuration in build');
    analyticsEnabled = false;
    isInitialized = true;
    return;
  }

  try {
    posthog.init(posthogApiKey, {
      api_host: posthogApiEndpoint,
      loaded: () => {
        console.log('[Analytics] PostHog initialized successfully');
        analyticsEnabled = true;
      },
      capture_pageview: false, // We'll manually capture page views
      capture_pageleave: true,
      autocapture: true, // Capture clicks and interactions automatically
    });
    isInitialized = true;
  } catch (error) {
    console.error('[Analytics] Failed to initialize PostHog:', error);
    analyticsEnabled = false;
    isInitialized = true;
  }
}

/**
 * Track a custom event
 */
export function trackEvent(
  eventName: string,
  properties?: Record<string, any>
): void {
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
