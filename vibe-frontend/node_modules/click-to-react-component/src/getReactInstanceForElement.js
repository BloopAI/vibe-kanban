/**
 * @param {HTMLElement} element
 */
export function getReactInstanceForElement(element) {
  // Prefer React DevTools, which has direct access to `react-dom` for mapping `element` <=> Fiber
  if ('__REACT_DEVTOOLS_GLOBAL_HOOK__' in window) {
    // @ts-expect-error - TS2339 - Property '__REACT_DEVTOOLS_GLOBAL_HOOK__' does not exist on type 'Window & typeof globalThis'.
    const { renderers } = window.__REACT_DEVTOOLS_GLOBAL_HOOK__

    for (const renderer of renderers.values()) {
      try {
        const fiber = renderer.findFiberByHostInstance(element)

        if (fiber) {
          return fiber
        }
      } catch (e) {
        // If React is mid-render, references to previous nodes may disappear during the click events
        // (This is especially true for interactive elements, like menus)
      }
    }
  }

  if ('_reactRootContainer' in element) {
    // @ts-expect-error - TS2339 - Property '_reactRootContainer' does not exist on type 'HTMLElement'.
    return element._reactRootContainer._internalRoot.current.child
  }

  // eslint-disable-next-line guard-for-in
  for (const key in element) {
    // Pre-Fiber access React internals
    if (key.startsWith('__reactInternalInstance$')) {
      return element[key]
    }

    // Fiber access to React internals
    if (key.startsWith('__reactFiber')) {
      return element[key]
    }
  }
}
