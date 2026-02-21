import { createElement } from 'react';

export function RunningDots() {
  return createElement(
    'div',
    { className: 'flex items-center gap-[2px] shrink-0' },
    createElement('span', {
      className: 'size-dot rounded-full bg-brand animate-running-dot-1',
    }),
    createElement('span', {
      className: 'size-dot rounded-full bg-brand animate-running-dot-2',
    }),
    createElement('span', {
      className: 'size-dot rounded-full bg-brand animate-running-dot-3',
    })
  );
}
