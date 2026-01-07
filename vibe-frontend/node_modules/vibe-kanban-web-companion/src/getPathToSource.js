/**
 * @typedef {import('react-reconciler').Source} Source
 * @typedef {import('./types').PathModifier} PathModifier
 */

/**
 * @param {Source} source
 * @param {PathModifier} pathModifier
 */
export function getPathToSource(source, pathModifier) {
  const {
    // It _does_ exist!
    // @ts-ignore Property 'columnNumber' does not exist on type 'Source'.ts(2339)
    columnNumber = 1,
    fileName,
    lineNumber = 1,
  } = source

  let path = `${fileName}:${lineNumber}:${columnNumber}`
  if (pathModifier) {
    path = pathModifier(path)
  }

  return path
}
