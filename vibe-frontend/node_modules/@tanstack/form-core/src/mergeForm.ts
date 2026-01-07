import type { FormApi } from './FormApi'

function isValidKey(key: string | number | symbol): boolean {
  const dangerousProps = ['__proto__', 'constructor', 'prototype']
  return !dangerousProps.includes(String(key))
}

/**
 * @private
 */
export function mutateMergeDeep(
  target: object | null | undefined,
  source: object | null | undefined,
): object {
  // Early return if either is not an object
  if (target === null || target === undefined || typeof target !== 'object')
    return {} as object
  if (source === null || source === undefined || typeof source !== 'object')
    return target

  const targetKeys = Object.keys(target)
  const sourceKeys = Object.keys(source)
  const keySet = new Set([...targetKeys, ...sourceKeys])

  for (const key of keySet) {
    if (!isValidKey(key)) continue

    const targetKey = key as keyof typeof target
    const sourceKey = key as keyof typeof source

    if (!Object.hasOwn(source, sourceKey)) continue

    const sourceValue = source[sourceKey] as unknown
    const targetValue = target[targetKey] as unknown

    // Handle arrays
    if (Array.isArray(targetValue) && Array.isArray(sourceValue)) {
      Object.defineProperty(target, key, {
        value: [...sourceValue],
        enumerable: true,
        writable: true,
        configurable: true,
      })
      continue
    }

    // Handle nested objects (type assertion to satisfy ESLint)
    const isTargetObj = typeof targetValue === 'object' && targetValue !== null
    const isSourceObj = typeof sourceValue === 'object' && sourceValue !== null
    const areObjects =
      isTargetObj &&
      isSourceObj &&
      !Array.isArray(targetValue) &&
      !Array.isArray(sourceValue)

    if (areObjects) {
      mutateMergeDeep(targetValue as object, sourceValue as object)
      continue
    }

    // Handle all other cases
    Object.defineProperty(target, key, {
      value: sourceValue,
      enumerable: true,
      writable: true,
      configurable: true,
    })
  }

  return target
}

export function mergeForm<TFormData>(
  baseForm: FormApi<
    NoInfer<TFormData>,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any
  >,
  state: Partial<
    FormApi<
      TFormData,
      any,
      any,
      any,
      any,
      any,
      any,
      any,
      any,
      any,
      any,
      any
    >['state']
  >,
) {
  mutateMergeDeep(baseForm.state, state)
  return baseForm
}
