// Allowlist of CSS variables that can be overridden via postMessage
// Extracted from frontend/src/styles/index.css
export const ALLOWED_CSS_VARS = new Set([
  // Base theme variables
  '--background',
  '--foreground',
  '--card',
  '--card-foreground',
  '--popover',
  '--popover-foreground',
  '--primary',
  '--primary-foreground',
  '--secondary',
  '--secondary-foreground',
  '--muted',
  '--muted-foreground',
  '--accent',
  '--accent-foreground',
  '--destructive',
  '--destructive-foreground',
  '--border',
  '--input',
  '--ring',
  '--radius',
  
  // Status colors
  '--success',
  '--success-foreground',
  '--warning',
  '--warning-foreground',
  '--info',
  '--info-foreground',
  '--neutral',
  '--neutral-foreground',
  
  // Status indicator colors
  '--status-init',
  '--status-init-foreground',
  '--status-running',
  '--status-running-foreground',
  '--status-complete',
  '--status-complete-foreground',
  '--status-failed',
  '--status-failed-foreground',
  '--status-paused',
  '--status-paused-foreground',
  
  // Console/terminal colors
  '--console-background',
  '--console-foreground',
  '--console-success',
  '--console-error',
]);

// Regex to validate HSL triplet values (e.g., "220 14% 96%")
export const HSL_TRIPLET_REGEX = /^\d{1,3}(?:\.\d+)?\s+\d{1,3}(?:\.\d+)?%\s+\d{1,3}(?:\.\d+)?%$/;

// Regex to validate rem values (e.g., "0.5rem")
export const REM_VALUE_REGEX = /^\d+(?:\.\d+)?rem$/;

export function isValidCSSValue(name: string, value: string): boolean {
  if (name === '--radius') {
    return REM_VALUE_REGEX.test(value);
  }
  return HSL_TRIPLET_REGEX.test(value);
}
