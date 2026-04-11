export function isMac(): boolean {
  // Modern API (Chrome, Edge) - not supported in Safari.
  const nav = navigator as Navigator & {
    userAgentData?: { platform?: string };
  };
  if (nav.userAgentData?.platform) {
    return nav.userAgentData.platform === 'macOS';
  }
  // Fallback for Safari and older browsers.
  return /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
}

export function getModifierKey(): string {
  return isMac() ? '\u2318' : 'Ctrl';
}

type TauriInvoke = (
  cmd: string,
  args?: Record<string, unknown>
) => Promise<unknown>;

export function getTauriInvoke(): TauriInvoke | null {
  if (typeof window === 'undefined') return null;
  const maybeInvoke = (
    window as Window & { __TAURI_INTERNALS__?: { invoke?: TauriInvoke } }
  ).__TAURI_INTERNALS__?.invoke;
  return typeof maybeInvoke === 'function' ? maybeInvoke : null;
}

export function isTauriRuntime(): boolean {
  return getTauriInvoke() !== null;
}
