/**
 * Concatenates two arrays faster than the array spread operator.
 */
export const concatArrays = <T, U>(
    array1: readonly T[],
    array2: readonly U[],
): readonly (T | U)[] => {
    // Pre-allocate for better V8 optimization
    const combinedArray: (T | U)[] = new Array(array1.length + array2.length)
    for (let i = 0; i < array1.length; i++) {
        combinedArray[i] = array1[i]!
    }
    for (let i = 0; i < array2.length; i++) {
        combinedArray[array1.length + i] = array2[i]!
    }
    return combinedArray
}
