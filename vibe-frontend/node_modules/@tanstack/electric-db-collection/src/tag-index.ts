// Import Row and Message types for the isEventMessage function
import type { Message, Row } from '@electric-sql/client'

export type RowId = string | number
export type MoveTag = string
export type ParsedMoveTag = Array<string>
export type Position = number
export type Value = string
export type MoveOutPattern = {
  pos: Position
  value: Value
}

const TAG_WILDCARD = `_`

/**
 * Event message type for move-out events
 */
export interface EventMessage {
  headers: {
    event: `move-out`
    patterns: Array<MoveOutPattern>
  }
}

/**
 * Tag index structure: array indexed by position, maps value to set of row IDs.
 * For example:
 * ```example
 * const tag1 = [a, b, c]
 * const tag2 = [a, b, d]
 * const tag3 = [a, d, e]
 *
 * // Index is:
 * [
 *   new Map([a -> <rows with a on index 0>])
 *   new Map([b -> <rows with b on index 1>, d -> <rows with d on index 1>])
 *   new Map([c -> <rows with c on index 2>, d -> <rows with d on index 2>, e -> <rows with e on index 2>])
 * ]
 * ```
 */
export type TagIndex = Array<Map<Value, Set<RowId>>>

/**
 * Abstraction to get the value at a specific position in a tag
 */
export function getValue(tag: ParsedMoveTag, position: Position): Value {
  if (position >= tag.length) {
    throw new Error(`Position out of bounds`)
  }
  return tag[position]!
}

/**
 * Abstraction to extract position and value from a pattern.
 */
function getPositionalValue(pattern: MoveOutPattern): {
  pos: number
  value: string
} {
  return pattern
}

/**
 * Abstraction to get the length of a tag
 */
export function getTagLength(tag: ParsedMoveTag): number {
  return tag.length
}

/**
 * Check if a tag matches a pattern.
 * A tag matches if the value at the pattern's position equals the pattern's value,
 * or if the value at that position is "_" (wildcard).
 */
export function tagMatchesPattern(
  tag: ParsedMoveTag,
  pattern: MoveOutPattern,
): boolean {
  const { pos, value } = getPositionalValue(pattern)
  const tagValue = getValue(tag, pos)
  return tagValue === value || tagValue === TAG_WILDCARD
}

/**
 * Add a tag to the index for efficient pattern matching
 */
export function addTagToIndex(
  tag: ParsedMoveTag,
  rowId: RowId,
  index: TagIndex,
  tagLength: number,
): void {
  for (let i = 0; i < tagLength; i++) {
    const value = getValue(tag, i)

    // Only index non-wildcard values
    if (value !== TAG_WILDCARD) {
      const positionIndex = index[i]!
      if (!positionIndex.has(value)) {
        positionIndex.set(value, new Set())
      }

      const tags = positionIndex.get(value)!
      tags.add(rowId)
    }
  }
}

/**
 * Remove a tag from the index
 */
export function removeTagFromIndex(
  tag: ParsedMoveTag,
  rowId: RowId,
  index: TagIndex,
  tagLength: number,
): void {
  for (let i = 0; i < tagLength; i++) {
    const value = getValue(tag, i)

    // Only remove non-wildcard values
    if (value !== TAG_WILDCARD) {
      const positionIndex = index[i]
      if (positionIndex) {
        const rowSet = positionIndex.get(value)
        if (rowSet) {
          rowSet.delete(rowId)

          // Clean up empty sets
          if (rowSet.size === 0) {
            positionIndex.delete(value)
          }
        }
      }
    }
  }
}

/**
 * Find all rows that match a given pattern
 */
export function findRowsMatchingPattern(
  pattern: MoveOutPattern,
  index: TagIndex,
): Set<RowId> {
  const { pos, value } = getPositionalValue(pattern)
  const positionIndex = index[pos]
  const rowSet = positionIndex?.get(value)
  return rowSet ?? new Set()
}

/**
 * Check if a message is an event message with move-out event
 */
export function isMoveOutMessage<T extends Row<unknown>>(
  message: Message<T>,
): message is Message<T> & EventMessage {
  return message.headers.event === `move-out`
}
