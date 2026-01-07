import { liteThrottle } from '@tanstack/pacer-lite'
import { formEventClient } from './EventClient'
import type { ValidationLogicProps } from './ValidationLogic'
import type { FieldValidators } from './FieldApi'
import type { AnyFormApi, FormValidators } from './FormApi'
import type {
  GlobalFormValidationError,
  ValidationCause,
  ValidationError,
  ValidationSource,
} from './types'

export type UpdaterFn<TInput, TOutput = TInput> = (input: TInput) => TOutput

export type Updater<TInput, TOutput = TInput> =
  | TOutput
  | UpdaterFn<TInput, TOutput>

/**
 * @private
 */
export function functionalUpdate<TInput, TOutput = TInput>(
  updater: Updater<TInput, TOutput>,
  input: TInput,
): TOutput {
  return typeof updater === 'function'
    ? (updater as UpdaterFn<TInput, TOutput>)(input)
    : updater
}

/**
 * Get a value from an object using a path, including dot notation.
 * @private
 */
export function getBy(obj: unknown, path: string | (string | number)[]): any {
  const pathObj = makePathArray(path)
  return pathObj.reduce((current: any, pathPart) => {
    if (current === null) return null
    if (typeof current !== 'undefined') {
      return current[pathPart]
    }
    return undefined
  }, obj)
}

/**
 * Set a value on an object using a path, including dot notation.
 * @private
 */
export function setBy(obj: any, _path: any, updater: Updater<any>) {
  const path = makePathArray(_path)

  function doSet(parent?: any): any {
    if (!path.length) {
      return functionalUpdate(updater, parent)
    }

    const key = path.shift()

    if (
      typeof key === 'string' ||
      (typeof key === 'number' && !Array.isArray(parent))
    ) {
      if (typeof parent === 'object') {
        if (parent === null) {
          parent = {}
        }
        return {
          ...parent,
          [key]: doSet(parent[key]),
        }
      }
      return {
        [key]: doSet(),
      }
    }

    if (Array.isArray(parent) && typeof key === 'number') {
      const prefix = parent.slice(0, key)
      return [
        ...(prefix.length ? prefix : new Array(key)),
        doSet(parent[key]),
        ...parent.slice(key + 1),
      ]
    }
    return [...new Array(key), doSet()]
  }

  return doSet(obj)
}

/**
 * Delete a field on an object using a path, including dot notation.
 * @private
 */
export function deleteBy(obj: any, _path: any) {
  const path = makePathArray(_path)

  function doDelete(parent: any): any {
    if (!parent) return
    if (path.length === 1) {
      const finalPath = path[0]!
      if (Array.isArray(parent) && typeof finalPath === 'number') {
        return parent.filter((_, i) => i !== finalPath)
      }
      const { [finalPath]: remove, ...rest } = parent
      return rest
    }

    const key = path.shift()

    if (
      typeof key === 'string' ||
      (typeof key === 'number' && !Array.isArray(parent))
    ) {
      if (typeof parent === 'object') {
        return {
          ...parent,
          [key]: doDelete(parent[key]),
        }
      }
    }

    if (typeof key === 'number') {
      if (Array.isArray(parent)) {
        if (key >= parent.length) {
          return parent
        }
        const prefix = parent.slice(0, key)
        return [
          ...(prefix.length ? prefix : new Array(key)),
          doDelete(parent[key]),
          ...parent.slice(key + 1),
        ]
      }
    }

    throw new Error('It seems we have created an infinite loop in deleteBy. ')
  }

  return doDelete(obj)
}

const reLineOfOnlyDigits = /^(\d+)$/gm
// the second dot must be in a lookahead or the engine
// will skip subsequent numbers (like foo.0.1.)
const reDigitsBetweenDots = /\.(\d+)(?=\.)/gm
const reStartWithDigitThenDot = /^(\d+)\./gm
const reDotWithDigitsToEnd = /\.(\d+$)/gm
const reMultipleDots = /\.{2,}/gm

const intPrefix = '__int__'
const intReplace = `${intPrefix}$1`

/**
 * @private
 */
export function makePathArray(str: string | Array<string | number>) {
  if (Array.isArray(str)) {
    return [...str]
  }

  if (typeof str !== 'string') {
    throw new Error('Path must be a string.')
  }

  return (
    str
      // Leading `[` may lead to wrong parsing down the line
      // (Example: '[0][1]' should be '0.1', not '.0.1')
      .replace(/(^\[)|]/gm, '')
      .replace(/\[/g, '.')
      .replace(reLineOfOnlyDigits, intReplace)
      .replace(reDigitsBetweenDots, `.${intReplace}.`)
      .replace(reStartWithDigitThenDot, `${intReplace}.`)
      .replace(reDotWithDigitsToEnd, `.${intReplace}`)
      .replace(reMultipleDots, '.')
      .split('.')
      .map((d) => {
        if (d.startsWith(intPrefix)) {
          const numStr = d.substring(intPrefix.length)
          const num = parseInt(numStr, 10)

          if (String(num) === numStr) {
            return num
          }
          return numStr
        }
        return d
      })
  )
}

/**
 * @private
 */
export function concatenatePaths(path1: string, path2: string): string {
  if (path1.length === 0) return path2
  if (path2.length === 0) return path1

  if (path2.startsWith('[')) {
    return path1 + path2
  }

  // In cases where parent and child withFieldGroup forms are both nested
  if (path2.startsWith('.')) {
    return path1 + path2
  }

  return `${path1}.${path2}`
}

/**
 * @private
 */
export function isNonEmptyArray(obj: any) {
  return !(Array.isArray(obj) && obj.length === 0)
}

interface AsyncValidatorArrayPartialOptions<T> {
  validators?: T
  asyncDebounceMs?: number
}

/**
 * @private
 */
export interface AsyncValidator<T> {
  cause: ValidationCause
  validate: T
  debounceMs: number
}

interface SyncValidatorArrayPartialOptions<T> {
  validators?: T
}

/**
 * @private
 */
export interface SyncValidator<T> {
  cause: ValidationCause
  validate: T
}

/**
 * @private
 */
export function getSyncValidatorArray<T>(
  cause: ValidationCause,
  options: SyncValidatorArrayPartialOptions<T> & {
    validationLogic?: any
    form?: any
  },
): T extends FieldValidators<
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
  any,
  any
>
  ? Array<
      SyncValidator<
        | T['onChange']
        | T['onBlur']
        | T['onSubmit']
        | T['onMount']
        | T['onDynamic']
      >
    >
  : T extends FormValidators<any, any, any, any, any, any, any, any, any, any>
    ? Array<
        SyncValidator<
          | T['onChange']
          | T['onBlur']
          | T['onSubmit']
          | T['onMount']
          | T['onDynamic']
        >
      >
    : never {
  const runValidation = (
    props: Parameters<ValidationLogicProps['runValidation']>[0],
  ) => {
    return props.validators.filter(Boolean).map((validator) => {
      return {
        cause: validator!.cause,
        validate: validator!.fn,
      }
    })
  }

  return options.validationLogic({
    form: options.form,
    validators: options.validators,
    event: { type: cause, async: false },
    runValidation,
  })
}

/**
 * @private
 */
export function getAsyncValidatorArray<T>(
  cause: ValidationCause,
  options: AsyncValidatorArrayPartialOptions<T> & {
    validationLogic?: any
    form?: any
  },
): T extends FieldValidators<
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
  any,
  any
>
  ? Array<
      AsyncValidator<
        | T['onChangeAsync']
        | T['onBlurAsync']
        | T['onSubmitAsync']
        | T['onDynamicAsync']
      >
    >
  : T extends FormValidators<any, any, any, any, any, any, any, any, any, any>
    ? Array<
        AsyncValidator<
          | T['onChangeAsync']
          | T['onBlurAsync']
          | T['onSubmitAsync']
          | T['onDynamicAsync']
        >
      >
    : never {
  const { asyncDebounceMs } = options
  const {
    onBlurAsyncDebounceMs,
    onChangeAsyncDebounceMs,
    onDynamicAsyncDebounceMs,
  } = (options.validators || {}) as
    | FieldValidators<
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
        any,
        any
      >
    | FormValidators<any, any, any, any, any, any, any, any, any, any>

  const defaultDebounceMs = asyncDebounceMs ?? 0

  const runValidation = (
    props: Parameters<ValidationLogicProps['runValidation']>[0],
  ) => {
    return props.validators.filter(Boolean).map((validator) => {
      const validatorCause = validator?.cause || cause

      let debounceMs = defaultDebounceMs

      switch (validatorCause) {
        case 'change':
          debounceMs = onChangeAsyncDebounceMs ?? defaultDebounceMs
          break
        case 'blur':
          debounceMs = onBlurAsyncDebounceMs ?? defaultDebounceMs
          break
        case 'dynamic':
          debounceMs = onDynamicAsyncDebounceMs ?? defaultDebounceMs
          break
        case 'submit':
          debounceMs = 0 // submit validators are always run immediately
          break
        default:
          break
      }

      if (cause === 'submit') {
        debounceMs = 0
      }

      return {
        cause: validatorCause,
        validate: validator!.fn,
        debounceMs: debounceMs,
      }
    })
  }

  return options.validationLogic({
    form: options.form,
    validators: options.validators,
    event: { type: cause, async: true },
    runValidation,
  })
}

export const isGlobalFormValidationError = (
  error: unknown,
): error is GlobalFormValidationError<unknown> => {
  return !!error && typeof error === 'object' && 'fields' in error
}

export function evaluate<T>(objA: T, objB: T) {
  if (Object.is(objA, objB)) {
    return true
  }

  if (
    typeof objA !== 'object' ||
    objA === null ||
    typeof objB !== 'object' ||
    objB === null
  ) {
    return false
  }

  if (objA instanceof Date && objB instanceof Date) {
    return objA.getTime() === objB.getTime()
  }

  if (objA instanceof Map && objB instanceof Map) {
    if (objA.size !== objB.size) return false
    for (const [k, v] of objA) {
      if (!objB.has(k) || !Object.is(v, objB.get(k))) return false
    }
    return true
  }

  if (objA instanceof Set && objB instanceof Set) {
    if (objA.size !== objB.size) return false
    for (const v of objA) {
      if (!objB.has(v)) return false
    }
    return true
  }

  const keysA = Object.keys(objA)
  const keysB = Object.keys(objB)

  if (keysA.length !== keysB.length) {
    return false
  }

  for (const key of keysA) {
    // performs recursive search down the object tree

    if (
      !keysB.includes(key) ||
      !evaluate(objA[key as keyof T], objB[key as keyof T])
    ) {
      return false
    }
  }

  return true
}

/**
 * Determines the logic for determining the error source and value to set on the field meta within the form level sync/async validation.
 * @private
 */
export const determineFormLevelErrorSourceAndValue = ({
  newFormValidatorError,
  isPreviousErrorFromFormValidator,
  previousErrorValue,
}: {
  newFormValidatorError: ValidationError
  isPreviousErrorFromFormValidator: boolean
  previousErrorValue: ValidationError
}): {
  newErrorValue: ValidationError
  newSource: ValidationSource | undefined
} => {
  // All falsy values are not considered errors
  if (newFormValidatorError) {
    return { newErrorValue: newFormValidatorError, newSource: 'form' }
  }

  // Clears form level error since it's now stale
  if (isPreviousErrorFromFormValidator) {
    return { newErrorValue: undefined, newSource: undefined }
  }

  // At this point, we have a preivous error which must have been set by the field validator, keep as is
  if (previousErrorValue) {
    return { newErrorValue: previousErrorValue, newSource: 'field' }
  }

  // No new or previous error, clear the error
  return { newErrorValue: undefined, newSource: undefined }
}

/**
 * Determines the logic for determining the error source and value to set on the field meta within the field level sync/async validation.
 * @private
 */
export const determineFieldLevelErrorSourceAndValue = ({
  formLevelError,
  fieldLevelError,
}: {
  formLevelError: ValidationError
  fieldLevelError: ValidationError
}): {
  newErrorValue: ValidationError
  newSource: ValidationSource | undefined
} => {
  // At field level, we prioritize the field level error
  if (fieldLevelError) {
    return { newErrorValue: fieldLevelError, newSource: 'field' }
  }

  // If there is no field level error, and there is a form level error, we set the form level error
  if (formLevelError) {
    return { newErrorValue: formLevelError, newSource: 'form' }
  }

  return { newErrorValue: undefined, newSource: undefined }
}

export function createFieldMap<T>(values: Readonly<T>): { [K in keyof T]: K } {
  const output: { [K in keyof T]: K } = {} as any

  for (const key in values) {
    output[key] = key
  }

  return output
}

/**
 * Merge the first parameter with the given overrides.
 * @private
 */
export function mergeOpts<T>(
  originalOpts: T | undefined | null,
  overrides: T,
): T {
  if (originalOpts === undefined || originalOpts === null) {
    return overrides
  }

  return { ...originalOpts, ...overrides }
}

/*
/ credit is due to https://github.com/lukeed/uuid for this code, with current npm
/ attacks we didn't feel comfortable installing directly from npm. But big appreciation
/ from the TanStack Form team <3.
*/

let IDX = 256
const HEX: string[] = []
let BUFFER: number[] | undefined

while (IDX--) {
  HEX[IDX] = (IDX + 256).toString(16).substring(1)
}

export function uuid(): string {
  let i = 0
  let num: number
  let out = ''

  if (!BUFFER || IDX + 16 > 256) {
    BUFFER = new Array<number>(256)
    i = 256
    while (i--) {
      BUFFER[i] = (256 * Math.random()) | 0
    }
    i = 0
    IDX = 0
  }

  for (; i < 16; i++) {
    num = BUFFER[IDX + i] as number
    if (i === 6) out += HEX[(num & 15) | 64]
    else if (i === 8) out += HEX[(num & 63) | 128]
    else out += HEX[num]

    if (i & 1 && i > 1 && i < 11) out += '-'
  }

  IDX++
  return out
}

export const throttleFormState = liteThrottle(
  (form: AnyFormApi) =>
    formEventClient.emit('form-state', {
      id: form.formId,
      state: form.store.state,
    }),
  {
    wait: 300,
  },
)
