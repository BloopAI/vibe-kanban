/**
 * @typedef {import('react-reconciler').Fiber} Fiber
 */

import { getReactInstanceForElement } from './getReactInstanceForElement.js'

export function getReactInstancesForElement(
  /** @type {HTMLElement} */
  element
) {
  /** @type {Set<Fiber>} */
  const instances = new Set()
  let instance = getReactInstanceForElement(element)

  while (instance) {
    instances.add(instance)

    instance = instance._debugOwner
  }

  return Array.from(instances)
}
