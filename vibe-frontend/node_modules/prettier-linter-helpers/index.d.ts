/**
 * Converts invisible characters to a commonly recognizable visible form.
 * @param {string} str - The string with invisibles to convert.
 * @returns {string} The converted string.
 */
export function showInvisibles(str: string): string;

export type Difference =
  | {
      operation: 'insert';
      insertText: string;
      offset: number;
    }
  | {
      operation: 'delete';
      deleteText: string;
      offset: number;
    }
  | {
      operation: 'replace';
      insertText: string;
      deleteText: string;
      offset: number;
    };

/**
 * Generate results for differences between source code and formatted version.
 *
 * @param {string} source - The original source.
 * @param {string} prettierSource - The Prettier formatted source.
 * @returns {Difference[]} - An array containing { operation, offset, insertText, deleteText }
 */
export function generateDifferences(
  source: string,
  prettierSource: string
): Difference[];
export namespace generateDifferences {
  let INSERT: 'insert';
  let DELETE: 'delete';
  let REPLACE: 'replace';
}
