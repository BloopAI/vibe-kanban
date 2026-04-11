import type { WheelEvent as ReactWheelEvent } from 'react';

import type { ConversationListHandle } from './ConversationListContainer';

const DOM_DELTA_LINE = 1;
const DOM_DELTA_PAGE = 2;

export function forwardWheelToScroller(
  e: ReactWheelEvent,
  listRef: React.RefObject<ConversationListHandle | null>
): void {
  const scrollEl = listRef.current?.getScrollElement?.();
  if (!scrollEl) return;

  const target = e.target;
  if (!(target instanceof Node)) return;
  if (scrollEl.contains(target)) return;

  if (e.ctrlKey) return;
  if (Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;

  let delta = e.deltaY;

  if (e.deltaMode === DOM_DELTA_LINE) {
    const lineHeight = parseFloat(getComputedStyle(scrollEl).lineHeight) || 16;
    delta *= lineHeight;
  } else if (e.deltaMode === DOM_DELTA_PAGE) {
    delta *= scrollEl.clientHeight;
  }

  scrollEl.scrollTop += delta;
}
