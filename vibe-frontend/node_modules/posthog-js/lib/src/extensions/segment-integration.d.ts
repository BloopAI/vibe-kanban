/**
 * Extend Segment with extra PostHog JS functionality. Required for things like Recordings and feature flags to work correctly.
 *
 * ### Usage
 *
 *  ```js
 *  // After your standard segment anyalytics install
 *  analytics.load("GOEDfA21zZTtR7clsBuDvmBKAtAdZ6Np");
 *
 *  analytics.ready(() => {
 *    posthog.init('<posthog-api-key>', {
 *      capture_pageview: false,
 *      segment: window.analytics, // NOTE: Be sure to use window.analytics here!
 *    });
 *    window.analytics.page();
 *  })
 *  ```
 */
import { PostHog } from '../posthog-core';
import type { SegmentUser, SegmentAnalytics, SegmentContext, SegmentPlugin } from '@posthog/types';
export type { SegmentUser, SegmentAnalytics, SegmentContext, SegmentPlugin };
export declare function setupSegmentIntegration(posthog: PostHog, done: () => void): void;
