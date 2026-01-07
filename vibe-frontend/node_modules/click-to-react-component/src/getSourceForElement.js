import { getReactInstanceForElement } from './getReactInstanceForElement'
import { getSourceForInstance } from './getSourceForInstance'

/**
 * @typedef {import('react-reconciler').Fiber} Fiber
 */

export function getSourceForElement(
  /**
   * @type {HTMLElement}
   */
  element
) {
  const instance = getReactInstanceForElement(element)
  const source = getSourceForInstance(instance)

  if (source) return source

  const fallbackSource = getFirstParentElementWithSource(element)
  return fallbackSource
}

function getFirstParentElementWithSource(element) {
  const parentElement = element.parentElement
  if (parentElement === null) {
    console.warn("Couldn't find a React instance for the element", element)
    throw new Error('No parent found for element')
  }

  const instance = getReactInstanceForElement(parentElement)
  const source = getSourceForInstance(instance)

  if (source) return source
  else return getFirstParentElementWithSource(element)
}
