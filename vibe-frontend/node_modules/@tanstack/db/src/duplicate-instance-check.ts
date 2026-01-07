import { DuplicateDbInstanceError } from './errors'

/**
 * Check if we're in a browser top-level window (not a worker, SSR, or iframe).
 * This helps avoid false positives in environments where multiple instances are legitimate.
 */
function isBrowserTopWindow(): boolean {
  const w = (globalThis as any).window
  // Exclude workers and SSR-ish shims
  if (!w || !(`document` in w)) return false
  // Avoid triggering inside iframes (cross-origin iframes can throw)
  try {
    return w === w.top
  } catch {
    return true // If we can't access w.top due to cross-origin, assume we should check
  }
}

// Detect duplicate @tanstack/db instances (dev-only, browser top-window only)
const DB_INSTANCE_MARKER = Symbol.for(`@tanstack/db/instance-marker`)
const DEV =
  typeof process !== `undefined` && process.env.NODE_ENV !== `production`
const DISABLED =
  typeof process !== `undefined` &&
  process.env.TANSTACK_DB_DISABLE_DUP_CHECK === `1`

if (DEV && !DISABLED && isBrowserTopWindow()) {
  if ((globalThis as any)[DB_INSTANCE_MARKER]) {
    throw new DuplicateDbInstanceError()
  }
  ;(globalThis as any)[DB_INSTANCE_MARKER] = true
}
