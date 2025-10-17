/**
 * Analytics ID enum for PostHog autocapture
 *
 * Format: {page}-{component}-{action}-{type}
 *
 * Usage:
 *   import { AnalyticsId } from '@/lib/analytics-ids';
 *   <Element data-ph-capture-attribute={AnalyticsId.NAV_PREVIEW_BUTTON} />
 *
 * Only elements with data-ph-capture-attribute will be tracked by autocapture.
 * This ensures stable, semantic identification that survives UI changes.
 */
export enum AnalyticsId {
  // View Navigation (Preview/Diffs)
  NAV_PREVIEW_BUTTON = 'attempt-header-preview-button',
  NAV_DIFFS_BUTTON = 'attempt-header-diffs-button',

  // Add more IDs as you instrument the UI...
}
