/**
 * Finds the correct insert position for a value in a sorted array using binary search
 * @param sortedArray The sorted array to search in
 * @param value The value to find the position for
 * @param compareFn Comparison function to use for ordering
 * @returns The index where the value should be inserted to maintain order
 */
export function findInsertPosition<T>(
  sortedArray: Array<[T, any]>,
  value: T,
  compareFn: (a: T, b: T) => number,
): number {
  let left = 0
  let right = sortedArray.length

  while (left < right) {
    const mid = Math.floor((left + right) / 2)
    const comparison = compareFn(sortedArray[mid]![0], value)

    if (comparison < 0) {
      left = mid + 1
    } else {
      right = mid
    }
  }

  return left
}
