// Re-export all public APIs
// Re-export IR types under their own namespace
// because custom collections need access to the IR types
import * as IR from './query/ir.js'

export * from './collection/index.js'
export * from './SortedMap'
export * from './transactions'
export * from './types'
export * from './proxy'
export * from './query/index.js'
export * from './optimistic-action'
export * from './local-only'
export * from './local-storage'
export * from './errors'
export { deepEquals } from './utils'
export * from './paced-mutations'
export * from './strategies/index.js'

// Index system exports
export * from './indexes/base-index.js'
export * from './indexes/btree-index.js'
export * from './indexes/lazy-index.js'
export { type IndexOptions } from './indexes/index-options.js'

// Expression helpers
export * from './query/expression-helpers.js'

// Re-export some stuff explicitly to ensure the type & value is exported
export type { Collection } from './collection/index.js'
export { IR }
export { operators, type OperatorName } from './query/builder/functions.js'
