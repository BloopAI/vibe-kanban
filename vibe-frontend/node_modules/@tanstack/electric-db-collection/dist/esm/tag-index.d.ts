import { Message, Row } from '@electric-sql/client';
export type RowId = string | number;
export type MoveTag = string;
export type ParsedMoveTag = Array<string>;
export type Position = number;
export type Value = string;
export type MoveOutPattern = {
    pos: Position;
    value: Value;
};
/**
 * Event message type for move-out events
 */
export interface EventMessage {
    headers: {
        event: `move-out`;
        patterns: Array<MoveOutPattern>;
    };
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
export type TagIndex = Array<Map<Value, Set<RowId>>>;
/**
 * Abstraction to get the value at a specific position in a tag
 */
export declare function getValue(tag: ParsedMoveTag, position: Position): Value;
/**
 * Abstraction to get the length of a tag
 */
export declare function getTagLength(tag: ParsedMoveTag): number;
/**
 * Check if a tag matches a pattern.
 * A tag matches if the value at the pattern's position equals the pattern's value,
 * or if the value at that position is "_" (wildcard).
 */
export declare function tagMatchesPattern(tag: ParsedMoveTag, pattern: MoveOutPattern): boolean;
/**
 * Add a tag to the index for efficient pattern matching
 */
export declare function addTagToIndex(tag: ParsedMoveTag, rowId: RowId, index: TagIndex, tagLength: number): void;
/**
 * Remove a tag from the index
 */
export declare function removeTagFromIndex(tag: ParsedMoveTag, rowId: RowId, index: TagIndex, tagLength: number): void;
/**
 * Find all rows that match a given pattern
 */
export declare function findRowsMatchingPattern(pattern: MoveOutPattern, index: TagIndex): Set<RowId>;
/**
 * Check if a message is an event message with move-out event
 */
export declare function isMoveOutMessage<T extends Row<unknown>>(message: Message<T>): message is Message<T> & EventMessage;
