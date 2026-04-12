/**
 * Centralized z-index scale. All stacking layers must use these constants
 * to prevent z-index wars across the component tree.
 *
 * Layer hierarchy:
 *   OVERLAY_BACKDROP → 9998  sheet/modal dimming backdrop
 *   MODAL            → 9999  base modal / dialog layer
 *   DROPDOWN         → 10000 popovers, selects, dropdowns (can appear inside modals)
 *   PICKER           → 10001 top-level sheets/pickers that must sit above modals
 */
export const Z = {
  OVERLAY_BACKDROP: 'z-[9998]',
  MODAL: 'z-[9999]',
  DROPDOWN: 'z-[10000]',
  PICKER: 'z-[10001]',
} as const;

/** Numeric counterparts for inline style={{ zIndex }} usage */
export const Z_NUM = {
  OVERLAY_BACKDROP: 9998,
  MODAL: 9999,
  DROPDOWN: 10000,
  PICKER: 10001,
} as const;
