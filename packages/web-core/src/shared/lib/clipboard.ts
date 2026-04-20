/** Ask the extension to copy text to the OS clipboard (fallback path). */
export function parentClipboardWrite(text: string) {
  try {
    window.parent.postMessage(
      { type: 'vscode-iframe-clipboard-copy', text },
      '*'
    );
  } catch (_err) {
    void 0;
  }
}

/** Copy helper that prefers navigator.clipboard and falls back to the bridge. */
export async function writeClipboardViaBridge(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    parentClipboardWrite(text);
    return false;
  }
}

/**
 * Three-tier best-effort clipboard write, used by the Cursor MCP banner
 * / connect hint where restrictive webview contexts are common.
 *
 * 1. `navigator.clipboard.writeText` — happy path (secure contexts).
 * 2. `document.execCommand('copy')` via a temporary textarea — works
 *    in older / restrictive contexts inside a user gesture.
 * 3. Return `false` so the caller can fall back to showing the text in
 *    a visible textarea and asking the user to select + copy by hand.
 *
 * Distinct from [`writeClipboardViaBridge`] which escalates to the
 * VS Code host via `window.parent.postMessage`: that path is VS Code
 * IDE–specific and doesn't do the execCommand fallback.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function'
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn('[clipboard] navigator.clipboard.writeText failed', err);
    }
  }
  if (typeof document === 'undefined') return false;
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.opacity = '0';
    el.style.pointerEvents = 'none';
    document.body.appendChild(el);
    el.focus();
    el.select();
    el.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch (err) {
    console.warn('[clipboard] execCommand copy fallback failed', err);
    return false;
  }
}
