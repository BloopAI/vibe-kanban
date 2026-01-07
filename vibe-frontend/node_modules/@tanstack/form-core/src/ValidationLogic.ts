import type { AnyFormApi, FormValidators } from './FormApi'

interface ValidationLogicValidatorsFn {
  // TODO: Type this properly
  fn: FormValidators<
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
  >[keyof FormValidators<any, any, any, any, any, any, any, any, any, any>]
  cause: 'change' | 'blur' | 'submit' | 'mount' | 'server' | 'dynamic'
}

export interface ValidationLogicProps {
  // TODO: Type this properly
  form: AnyFormApi
  // TODO: Type this properly
  validators:
    | FormValidators<any, any, any, any, any, any, any, any, any, any>
    | undefined
    | null
  event: {
    type: 'blur' | 'change' | 'submit' | 'mount' | 'server'
    fieldName?: string
    async: boolean
  }
  runValidation: (props: {
    validators: Array<ValidationLogicValidatorsFn | undefined>
    form: AnyFormApi
  }) => void
}

interface RevalidateLogicProps {
  /**
   * @default 'submit'
   *
   * This is the mode that will be used before the form has been submitted.
   * It will run the validation logic on `submit` by default, but can be set to `change` or `blur`.
   */
  mode?: 'change' | 'blur' | 'submit'
  /**
   * @default 'change'
   *
   * This is the mode that will be used after the form has been submitted.
   * It will run the validation logic on `change` by default, but can be set to `blur` or `submit`.
   */
  modeAfterSubmission?: 'change' | 'blur' | 'submit'
}

export type ValidationLogicFn = (props: ValidationLogicProps) => void

/**
 * This forces a form's validation logic to be ran as if it were a React Hook Form validation logic.
 *
 * This means that it will only run the `onDynamic` validator, and it will not run any other validators and changes the validation
 * type based on the state of the form itself.
 *
 * When the form is not yet submitted, it will not run the validation logic.
 * When the form is submitted, it will run the validation logic on `change`
 */
export const revalidateLogic =
  ({
    mode = 'submit',
    modeAfterSubmission = 'change',
  }: RevalidateLogicProps = {}): ValidationLogicFn =>
  (props) => {
    const validatorNames = Object.keys(props.validators ?? {})
    if (validatorNames.length === 0) {
      // No validators is a valid case, just return
      return props.runValidation({
        validators: [],
        form: props.form,
      })
    }

    const dynamicValidator = {
      fn: props.event.async
        ? props.validators!['onDynamicAsync']
        : props.validators!['onDynamic'],
      cause: 'dynamic',
    } as const

    const validatorsToAdd = [] as ValidationLogicValidatorsFn[]

    const modeToWatch =
      props.form.state.submissionAttempts === 0 ? mode : modeAfterSubmission

    if ([modeToWatch, 'submit'].includes(props.event.type)) {
      validatorsToAdd.push(dynamicValidator)
    }

    let defaultValidators = [] as ValidationLogicValidatorsFn[]

    defaultValidationLogic({
      ...props,
      runValidation: (vProps) => {
        defaultValidators = vProps.validators as ValidationLogicValidatorsFn[]
      },
    })

    if (validatorsToAdd.length === 0) {
      return props.runValidation({
        validators: defaultValidators,
        form: props.form,
      })
    }

    return props.runValidation({
      validators: [...defaultValidators, ...validatorsToAdd],
      form: props.form,
    })
  }

export const defaultValidationLogic: ValidationLogicFn = (props) => {
  // Handle case where no validators are provided
  if (!props.validators) {
    return props.runValidation({
      validators: [],
      form: props.form,
    })
  }

  const isAsync = props.event.async

  const onMountValidator = isAsync
    ? undefined
    : ({ fn: props.validators.onMount, cause: 'mount' } as const)

  const onChangeValidator = {
    fn: isAsync ? props.validators.onChangeAsync : props.validators.onChange,
    cause: 'change',
  } as const

  const onBlurValidator = {
    fn: isAsync ? props.validators.onBlurAsync : props.validators.onBlur,
    cause: 'blur',
  } as const

  const onSubmitValidator = {
    fn: isAsync ? props.validators.onSubmitAsync : props.validators.onSubmit,
    cause: 'submit',
  } as const

  // Allows us to clear onServer errors
  const onServerValidator = isAsync
    ? undefined
    : ({ fn: () => undefined, cause: 'server' } as const)

  switch (props.event.type) {
    case 'mount': {
      // Run mount validation
      return props.runValidation({
        validators: [onMountValidator],
        form: props.form,
      })
    }
    case 'submit': {
      // Run change, blur, submit, server validation
      return props.runValidation({
        validators: [
          onChangeValidator,
          onBlurValidator,
          onSubmitValidator,
          onServerValidator,
        ],
        form: props.form,
      })
    }
    case 'server': {
      // Run server validation
      return props.runValidation({
        validators: [],
        form: props.form,
      })
    }
    case 'blur': {
      // Run blur, server validation
      return props.runValidation({
        validators: [onBlurValidator, onServerValidator],
        form: props.form,
      })
    }
    case 'change': {
      // Run change, server validation
      return props.runValidation({
        validators: [onChangeValidator, onServerValidator],
        form: props.form,
      })
    }
    default: {
      throw new Error(`Unknown validation event type: ${props.event.type}`)
    }
  }
}
