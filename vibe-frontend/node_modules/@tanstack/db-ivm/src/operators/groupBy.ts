import { map } from './map.js'
import { reduce } from './reduce.js'
import type { IStreamBuilder, KeyValue } from '../types.js'

type GroupKey = Record<string, unknown>

type BasicAggregateFunction<T, R, V = unknown> = {
  preMap: (data: T) => V
  reduce: (values: Array<[V, number]>) => V
  postMap?: (result: V) => R
}

type PipedAggregateFunction<T, R> = {
  pipe: (stream: IStreamBuilder<T>) => IStreamBuilder<KeyValue<string, R>>
}

type AggregateFunction<T, R, V = unknown> =
  | BasicAggregateFunction<T, R, V>
  | PipedAggregateFunction<T, R>

type ExtractAggregateReturnType<T, A> =
  A extends AggregateFunction<T, infer R, any> ? R : never

type AggregatesReturnType<T, A> = {
  [K in keyof A]: ExtractAggregateReturnType<T, A[K]>
}

function isPipedAggregateFunction<T, R>(
  aggregate: AggregateFunction<T, R>,
): aggregate is PipedAggregateFunction<T, R> {
  return `pipe` in aggregate
}

/**
 * Groups data by key and applies multiple aggregate operations
 * @param keyExtractor Function to extract grouping key from data
 * @param aggregates Object mapping aggregate names to aggregate functions
 */
export function groupBy<
  T,
  K extends GroupKey,
  A extends Record<string, AggregateFunction<T, any, any>>,
>(keyExtractor: (data: T) => K, aggregates: A = {} as A) {
  type ResultType = K & AggregatesReturnType<T, A>

  const basicAggregates = Object.fromEntries(
    Object.entries(aggregates).filter(
      ([_, aggregate]) => !isPipedAggregateFunction(aggregate),
    ),
  ) as Record<string, BasicAggregateFunction<T, any, any>>

  // @ts-expect-error - TODO: we don't use this yet, but we will
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const pipedAggregates = Object.fromEntries(
    Object.entries(aggregates).filter(([_, aggregate]) =>
      isPipedAggregateFunction(aggregate),
    ),
  ) as Record<string, PipedAggregateFunction<T, any>>

  return (
    stream: IStreamBuilder<T>,
  ): IStreamBuilder<KeyValue<string, ResultType>> => {
    // Special key to store the original key object
    const KEY_SENTINEL = `__original_key__`

    // First map to extract keys and pre-aggregate values
    const withKeysAndValues = stream.pipe(
      map((data) => {
        const key = keyExtractor(data)
        const keyString = JSON.stringify(key)

        // Create values object with pre-aggregated values
        const values: Record<string, unknown> = {}

        // Store the original key object
        values[KEY_SENTINEL] = key

        // Add pre-aggregated values
        for (const [name, aggregate] of Object.entries(basicAggregates)) {
          values[name] = aggregate.preMap(data)
        }

        return [keyString, values] as KeyValue<string, Record<string, unknown>>
      }),
    )

    // Then reduce to compute aggregates
    const reduced = withKeysAndValues.pipe(
      reduce((values) => {
        // Calculate total multiplicity to check if the group should exist
        let totalMultiplicity = 0
        for (const [_, multiplicity] of values) {
          totalMultiplicity += multiplicity
        }

        // If total multiplicity is 0 or negative, the group should be removed completely
        if (totalMultiplicity <= 0) {
          return []
        }

        const result: Record<string, unknown> = {}

        // Get the original key from first value in group
        const originalKey = values[0]?.[0]?.[KEY_SENTINEL]
        result[KEY_SENTINEL] = originalKey

        // Apply each aggregate function
        for (const [name, aggregate] of Object.entries(basicAggregates)) {
          const preValues = values.map(
            ([v, m]) => [v[name], m] as [any, number],
          )
          result[name] = aggregate.reduce(preValues)
        }

        return [[result, 1]]
      }),
    )

    // Finally map to extract the key and include all values
    return reduced.pipe(
      map(([keyString, values]) => {
        // Extract the original key
        const key = values[KEY_SENTINEL] as K

        // Create intermediate result with key values and aggregate results
        const result: Record<string, unknown> = {}

        // Add key properties to result
        Object.assign(result, key)

        // Apply postMap if provided
        for (const [name, aggregate] of Object.entries(basicAggregates)) {
          if (aggregate.postMap) {
            result[name] = aggregate.postMap(values[name])
          } else {
            result[name] = values[name]
          }
        }

        // Return with the string key instead of the object
        return [keyString, result] as KeyValue<string, ResultType>
      }),
    )
  }
}

/**
 * Creates a sum aggregate function
 */
export function sum<T>(
  valueExtractor: (value: T) => number = (v) => v as unknown as number,
): AggregateFunction<T, number, number> {
  return {
    preMap: (data: T) => valueExtractor(data),
    reduce: (values: Array<[number, number]>) => {
      let total = 0
      for (const [value, multiplicity] of values) {
        total += value * multiplicity
      }
      return total
    },
  }
}

/**
 * Creates a count aggregate function
 */
export function count<T>(
  valueExtractor: (value: T) => any = (v) => v,
): AggregateFunction<T, number, number> {
  return {
    // Count only not-null values (the `== null` comparison gives true for both null and undefined)
    preMap: (data: T) => (valueExtractor(data) == null ? 0 : 1),
    reduce: (values: Array<[number, number]>) => {
      let totalCount = 0
      for (const [nullMultiplier, multiplicity] of values) {
        totalCount += nullMultiplier * multiplicity
      }
      return totalCount
    },
  }
}

/**
 * Creates an average aggregate function
 */
export function avg<T>(
  valueExtractor: (value: T) => number = (v) => v as unknown as number,
): AggregateFunction<T, number, { sum: number; count: number }> {
  return {
    preMap: (data: T) => ({
      sum: valueExtractor(data),
      count: 0,
    }),
    reduce: (values: Array<[{ sum: number; count: number }, number]>) => {
      let totalSum = 0
      let totalCount = 0
      for (const [value, multiplicity] of values) {
        totalSum += value.sum * multiplicity
        totalCount += multiplicity
      }
      return {
        sum: totalSum,
        count: totalCount,
      }
    },
    postMap: (result: { sum: number; count: number }) => {
      return result.sum / result.count
    },
  }
}

type CanMinMax = number | Date | bigint

/**
 * Creates a min aggregate function that computes the minimum value in a group
 * @param valueExtractor Function to extract a comparable value from each data entry
 */
export function min<T extends CanMinMax>(): AggregateFunction<
  T,
  T | undefined,
  T | undefined
>
export function min<T, V extends CanMinMax>(
  valueExtractor: (value: T) => V,
): AggregateFunction<T, V | undefined, V | undefined>
export function min<T, V extends CanMinMax>(
  valueExtractor?: (value: T) => V,
): AggregateFunction<T, V | undefined, V | undefined> {
  const extractor = valueExtractor ?? ((v: T) => v as unknown as V)
  return {
    preMap: (data: T) => extractor(data),
    reduce: (values) => {
      let minValue: V | undefined
      for (const [value, _multiplicity] of values) {
        if (!minValue || (value && value < minValue)) {
          minValue = value
        }
      }
      return minValue
    },
  }
}

/**
 * Creates a max aggregate function that computes the maximum value in a group
 * @param valueExtractor Function to extract a comparable value from each data entry
 */
export function max<T extends CanMinMax>(): AggregateFunction<
  T,
  T | undefined,
  T | undefined
>
export function max<T, V extends CanMinMax>(
  valueExtractor: (value: T) => V,
): AggregateFunction<T, V | undefined, V | undefined>
export function max<T, V extends CanMinMax>(
  valueExtractor?: (value: T) => V,
): AggregateFunction<T, V | undefined, V | undefined> {
  const extractor = valueExtractor ?? ((v: T) => v as unknown as V)
  return {
    preMap: (data: T) => extractor(data),
    reduce: (values) => {
      let maxValue: V | undefined
      for (const [value, _multiplicity] of values) {
        if (!maxValue || (value && value > maxValue)) {
          maxValue = value
        }
      }
      return maxValue
    },
  }
}

/**
 * Creates a median aggregate function that computes the middle value in a sorted group
 * If there's an even number of values, returns the average of the two middle values
 * @param valueExtractor Function to extract a numeric value from each data entry
 */
export function median<T>(
  valueExtractor: (value: T) => number = (v) => v as unknown as number,
): AggregateFunction<T, number, Array<number>> {
  return {
    preMap: (data: T) => [valueExtractor(data)],
    reduce: (values: Array<[Array<number>, number]>) => {
      // Flatten all values, taking multiplicity into account
      const allValues: Array<number> = []
      for (const [valueArray, multiplicity] of values) {
        for (const value of valueArray) {
          // Add each value multiple times based on multiplicity
          for (let i = 0; i < multiplicity; i++) {
            allValues.push(value)
          }
        }
      }

      // Return empty array if no values
      if (allValues.length === 0) {
        return []
      }

      // Sort values
      allValues.sort((a, b) => a - b)

      return allValues
    },
    postMap: (result: Array<number>) => {
      if (result.length === 0) return 0

      const mid = Math.floor(result.length / 2)

      // If even number of values, average the two middle values
      if (result.length % 2 === 0) {
        return (result[mid - 1]! + result[mid]!) / 2
      }

      // If odd number of values, return the middle value
      return result[mid]!
    },
  }
}

/**
 * Creates a mode aggregate function that computes the most frequent value in a group
 * If multiple values have the same highest frequency, returns the first one encountered
 * @param valueExtractor Function to extract a value from each data entry
 */
export function mode<T>(
  valueExtractor: (value: T) => number = (v) => v as unknown as number,
): AggregateFunction<T, number, Map<number, number>> {
  return {
    preMap: (data: T) => {
      const value = valueExtractor(data)
      const frequencyMap = new Map<number, number>()
      frequencyMap.set(value, 1)
      return frequencyMap
    },
    reduce: (values: Array<[Map<number, number>, number]>) => {
      // Combine all frequency maps
      const combinedMap = new Map<number, number>()

      for (const [frequencyMap, multiplicity] of values) {
        for (const [value, frequencyCount] of frequencyMap.entries()) {
          const currentCount = combinedMap.get(value) || 0
          combinedMap.set(value, currentCount + frequencyCount * multiplicity)
        }
      }

      return combinedMap
    },
    postMap: (result: Map<number, number>) => {
      if (result.size === 0) return 0

      let modeValue = 0
      let maxFrequency = 0

      for (const [value, frequency] of result.entries()) {
        if (frequency > maxFrequency) {
          maxFrequency = frequency
          modeValue = value
        }
      }

      return modeValue
    },
  }
}

export const groupByOperators = {
  sum,
  count,
  avg,
  min,
  max,
  median,
  mode,
}
