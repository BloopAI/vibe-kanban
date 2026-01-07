import type { ValidationSource } from './types'

export type TStandardSchemaValidatorValue<
  TData,
  TSource extends ValidationSource = ValidationSource,
> = {
  value: TData
  validationSource: TSource
}

export type TStandardSchemaValidatorIssue<
  TSource extends ValidationSource = ValidationSource,
> = TSource extends 'form'
  ? {
      form: Record<string, StandardSchemaV1Issue[]>
      fields: Record<string, StandardSchemaV1Issue[]>
    }
  : TSource extends 'field'
    ? StandardSchemaV1Issue[]
    : never

function prefixSchemaToErrors(
  issues: readonly StandardSchemaV1Issue[],
  formValue: unknown,
) {
  const schema = new Map<string, StandardSchemaV1Issue[]>()

  for (const issue of issues) {
    const issuePath = issue.path ?? []

    let currentFormValue = formValue
    let path = ''

    for (let i = 0; i < issuePath.length; i++) {
      const pathSegment = issuePath[i]
      if (pathSegment === undefined) continue

      const segment =
        typeof pathSegment === 'object' ? pathSegment.key : pathSegment

      // Standard Schema doesn't specify if paths should use numbers or stringified numbers for array access.
      // However, if we follow the path it provides and encounter an array, then we can assume it's intended for array access.
      const segmentAsNumber = Number(segment)
      if (Array.isArray(currentFormValue) && !Number.isNaN(segmentAsNumber)) {
        path += `[${segmentAsNumber}]`
      } else {
        path += (i > 0 ? '.' : '') + String(segment)
      }

      if (typeof currentFormValue === 'object' && currentFormValue !== null) {
        currentFormValue = currentFormValue[segment as never]
      } else {
        currentFormValue = undefined
      }
    }
    schema.set(path, (schema.get(path) ?? []).concat(issue))
  }

  return Object.fromEntries(schema)
}

const transformFormIssues = <TSource extends ValidationSource>(
  issues: readonly StandardSchemaV1Issue[],
  formValue: unknown,
): TStandardSchemaValidatorIssue<TSource> => {
  const schemaErrors = prefixSchemaToErrors(issues, formValue)
  return {
    form: schemaErrors,
    fields: schemaErrors,
  } as TStandardSchemaValidatorIssue<TSource>
}

export const standardSchemaValidators = {
  validate<TSource extends ValidationSource = ValidationSource>(
    {
      value,
      validationSource,
    }: TStandardSchemaValidatorValue<unknown, TSource>,
    schema: StandardSchemaV1,
  ): TStandardSchemaValidatorIssue<TSource> | undefined {
    const result = schema['~standard'].validate(value)

    if (result instanceof Promise) {
      throw new Error('async function passed to sync validator')
    }

    if (!result.issues) return

    if (validationSource === 'field')
      return result.issues as TStandardSchemaValidatorIssue<TSource>
    return transformFormIssues<TSource>(result.issues, value)
  },
  async validateAsync<TSource extends ValidationSource>(
    {
      value,
      validationSource,
    }: TStandardSchemaValidatorValue<unknown, TSource>,
    schema: StandardSchemaV1,
  ): Promise<TStandardSchemaValidatorIssue<TSource> | undefined> {
    const result = await schema['~standard'].validate(value)

    if (!result.issues) return

    if (validationSource === 'field')
      return result.issues as TStandardSchemaValidatorIssue<TSource>
    return transformFormIssues<TSource>(result.issues, value)
  },
}

export const isStandardSchemaValidator = (
  validator: unknown,
): validator is StandardSchemaV1 =>
  !!validator && '~standard' in (validator as object)

/**
 * The Standard Schema interface.
 */
export type StandardSchemaV1<Input = unknown, Output = Input> = {
  /**
   * The Standard Schema properties.
   */
  readonly '~standard': StandardSchemaV1Props<Input, Output>
}

/**
 * The Standard Schema properties interface.
 */
interface StandardSchemaV1Props<Input = unknown, Output = Input> {
  /**
   * The version number of the standard.
   */
  readonly version: 1
  /**
   * The vendor name of the schema library.
   */
  readonly vendor: string
  /**
   * Validates unknown input values.
   */
  readonly validate: (
    value: unknown,
  ) => StandardSchemaV1Result<Output> | Promise<StandardSchemaV1Result<Output>>
  /**
   * Inferred types associated with the schema.
   */
  readonly types?: StandardSchemaV1Types<Input, Output> | undefined
}
/**
 * The result interface of the validate function.
 */
type StandardSchemaV1Result<Output> =
  | StandardSchemaV1SuccessResult<Output>
  | StandardSchemaV1FailureResult
/**
 * The result interface if validation succeeds.
 */
interface StandardSchemaV1SuccessResult<Output> {
  /**
   * The typed output value.
   */
  readonly value: Output
  /**
   * The non-existent issues.
   */
  readonly issues?: undefined
}
/**
 * The result interface if validation fails.
 */
interface StandardSchemaV1FailureResult {
  /**
   * The issues of failed validation.
   */
  readonly issues: ReadonlyArray<StandardSchemaV1Issue>
}
/**
 * The issue interface of the failure output.
 */
export interface StandardSchemaV1Issue {
  /**
   * The error message of the issue.
   */
  readonly message: string
  /**
   * The path of the issue, if any.
   */
  readonly path?:
    | ReadonlyArray<PropertyKey | StandardSchemaV1PathSegment>
    | undefined
}
/**
 * The path segment interface of the issue.
 */
interface StandardSchemaV1PathSegment {
  /**
   * The key representing a path segment.
   */
  readonly key: PropertyKey
}
/**
 * The Standard Schema types interface.
 */
interface StandardSchemaV1Types<Input = unknown, Output = Input> {
  /**
   * The input type of the schema.
   */
  readonly input: Input
  /**
   * The output type of the schema.
   */
  readonly output: Output
}
