/**
 * An Enter that CONFIRMS an IME candidate must not reach a shortcut or a submit handler.
 *
 * `event.isComposing` alone is not enough. **Safari fires `compositionend` BEFORE the confirming
 * Enter's `keydown`**, so the flag is already `false` when the handler runs and the keypress goes
 * through — the line submits half-composed. Chrome and Firefox fire it after, which is why the
 * naive guard looks correct there and the bug reads as Safari-only.
 *
 * A tight window after `compositionend` covers it: that sequence is synchronous (microseconds),
 * while a human pressing Enter a second time takes 100ms or more and never lands inside it.
 *
 * Composition is tracked on `window` in the capture phase rather than per field, so a composition
 * that starts in one input and ends after focus moves still closes, and a handler bound to
 * something that cannot hold text can call this safely — no composition ever opens there.
 */
export const SAFARI_IME_RACE_WINDOW_MS = 30;

let composing = false;
// Not 0: `performance.now()` counts from the page's time origin, so `now - 0` is under the
// window for the first 30ms of the page and would swallow an Enter no composition preceded.
let lastCompositionEndAt = Number.NEGATIVE_INFINITY;

if (typeof window !== 'undefined') {
  window.addEventListener(
    'compositionstart',
    () => {
      composing = true;
    },
    true
  );
  window.addEventListener(
    'compositionend',
    () => {
      composing = false;
      lastCompositionEndAt = performance.now();
    },
    true
  );
  // `blur` does not bubble, but a capture-phase listener on `window` still sees it on the way
  // down — otherwise a composition abandoned by clicking away would stay open forever.
  window.addEventListener(
    'blur',
    () => {
      composing = false;
    },
    true
  );
}

/** True when this keydown is (or is very likely) an IME confirmation rather than a real keypress. */
export function isImeConfirmation(
  event: Pick<KeyboardEvent, 'isComposing' | 'key'>
): boolean {
  // An open composition swallows every key, because none of them reached the application.
  if (event.isComposing || composing) return true;
  // The window after it is Enter-only. It exists for the keystroke that CONFIRMS a candidate,
  // and that keystroke is Enter; applying it to every key would drop an unrelated shortcut for
  // 30ms after any composition ended.
  if (event.key !== 'Enter') return false;
  return performance.now() - lastCompositionEndAt < SAFARI_IME_RACE_WINDOW_MS;
}
