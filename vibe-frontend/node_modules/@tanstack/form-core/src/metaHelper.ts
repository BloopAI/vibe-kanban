import type {
  FormApi,
  FormAsyncValidateOrFn,
  FormValidateOrFn,
} from './FormApi'
import type { AnyFieldMeta } from './FieldApi'
import type { DeepKeys } from './util-types'

type ValueFieldMode = 'insert' | 'remove' | 'swap' | 'move'

export const defaultFieldMeta: AnyFieldMeta = {
  isValidating: false,
  isTouched: false,
  isBlurred: false,
  isDirty: false,
  isPristine: true,
  isValid: true,
  isDefaultValue: true,
  errors: [],
  errorMap: {},
  errorSourceMap: {},
}

export function metaHelper<
  TFormData,
  TOnMount extends undefined | FormValidateOrFn<TFormData>,
  TOnChange extends undefined | FormValidateOrFn<TFormData>,
  TOnChangeAsync extends undefined | FormAsyncValidateOrFn<TFormData>,
  TOnBlur extends undefined | FormValidateOrFn<TFormData>,
  TOnBlurAsync extends undefined | FormAsyncValidateOrFn<TFormData>,
  TOnSubmit extends undefined | FormValidateOrFn<TFormData>,
  TOnSubmitAsync extends undefined | FormAsyncValidateOrFn<TFormData>,
  TOnDynamic extends undefined | FormValidateOrFn<TFormData>,
  TOnDynamicAsync extends undefined | FormAsyncValidateOrFn<TFormData>,
  TOnServer extends undefined | FormAsyncValidateOrFn<TFormData>,
  TSubmitMeta = never,
>(
  formApi: FormApi<
    TFormData,
    TOnMount,
    TOnChange,
    TOnChangeAsync,
    TOnBlur,
    TOnBlurAsync,
    TOnSubmit,
    TOnSubmitAsync,
    TOnDynamic,
    TOnDynamicAsync,
    TOnServer,
    TSubmitMeta
  >,
) {
  /**
   * Handle the meta shift caused from moving a field from one index to another.
   */
  function handleArrayMove(
    field: DeepKeys<TFormData>,
    fromIndex: number,
    toIndex: number,
  ) {
    const affectedFields = getAffectedFields(field, fromIndex, 'move', toIndex)

    const startIndex = Math.min(fromIndex, toIndex)
    const endIndex = Math.max(fromIndex, toIndex)
    for (let i = startIndex; i <= endIndex; i++) {
      affectedFields.push(getFieldPath(field, i))
    }

    // Store the original field meta that will be reapplied at the destination index
    const fromFields = Object.keys(formApi.fieldInfo).reduce(
      (fieldMap, fieldKey) => {
        if (fieldKey.startsWith(getFieldPath(field, fromIndex))) {
          fieldMap.set(
            fieldKey as DeepKeys<TFormData>,
            formApi.getFieldMeta(fieldKey as DeepKeys<TFormData>),
          )
        }
        return fieldMap
      },
      new Map<DeepKeys<TFormData>, AnyFieldMeta | undefined>(),
    )

    shiftMeta(affectedFields, fromIndex < toIndex ? 'up' : 'down')

    // Reapply the stored field meta at the destination index
    Object.keys(formApi.fieldInfo)
      .filter((fieldKey) => fieldKey.startsWith(getFieldPath(field, toIndex)))
      .forEach((fieldKey) => {
        const fromKey = fieldKey.replace(
          getFieldPath(field, toIndex),
          getFieldPath(field, fromIndex),
        ) as DeepKeys<TFormData>

        const fromMeta = fromFields.get(fromKey)
        if (fromMeta) {
          formApi.setFieldMeta(fieldKey as DeepKeys<TFormData>, fromMeta)
        }
      })
  }

  /**
   * Handle the meta shift from removing a field at the specified index.
   */
  function handleArrayRemove(field: DeepKeys<TFormData>, index: number) {
    const affectedFields = getAffectedFields(field, index, 'remove')

    shiftMeta(affectedFields, 'up')
  }

  /**
   * Handle the meta shift from swapping two fields at the specified indeces.
   */
  function handleArraySwap(
    field: DeepKeys<TFormData>,
    index: number,
    secondIndex: number,
  ) {
    const affectedFields = getAffectedFields(field, index, 'swap', secondIndex)

    affectedFields.forEach((fieldKey) => {
      if (!fieldKey.toString().startsWith(getFieldPath(field, index))) {
        return
      }

      const swappedKey = fieldKey
        .toString()
        .replace(
          getFieldPath(field, index),
          getFieldPath(field, secondIndex),
        ) as DeepKeys<TFormData>

      const [meta1, meta2] = [
        formApi.getFieldMeta(fieldKey),
        formApi.getFieldMeta(swappedKey),
      ]

      if (meta1) formApi.setFieldMeta(swappedKey, meta1)
      if (meta2) formApi.setFieldMeta(fieldKey, meta2)
    })
  }

  /**
   * Handle the meta shift from inserting a field at the specified index.
   */
  function handleArrayInsert(field: DeepKeys<TFormData>, insertIndex: number) {
    const affectedFields = getAffectedFields(field, insertIndex, 'insert')

    shiftMeta(affectedFields, 'down')

    affectedFields.forEach((fieldKey) => {
      if (fieldKey.toString().startsWith(getFieldPath(field, insertIndex))) {
        formApi.setFieldMeta(fieldKey, getEmptyFieldMeta())
      }
    })
  }

  function getFieldPath(
    field: DeepKeys<TFormData>,
    index: number,
  ): DeepKeys<TFormData> {
    return `${field}[${index}]` as DeepKeys<TFormData>
  }

  function getAffectedFields(
    field: DeepKeys<TFormData>,
    index: number,
    mode: ValueFieldMode,
    secondIndex?: number,
  ): DeepKeys<TFormData>[] {
    const affectedFieldKeys = [getFieldPath(field, index)]

    switch (mode) {
      case 'swap':
        affectedFieldKeys.push(getFieldPath(field, secondIndex!))
        break
      case 'move': {
        const [startIndex, endIndex] = [
          Math.min(index, secondIndex!),
          Math.max(index, secondIndex!),
        ]
        for (let i = startIndex; i <= endIndex; i++) {
          affectedFieldKeys.push(getFieldPath(field, i))
        }
        break
      }
      default: {
        const currentValue = formApi.getFieldValue(field)
        const fieldItems = Array.isArray(currentValue)
          ? (currentValue as Array<unknown>).length
          : 0
        for (let i = index + 1; i < fieldItems; i++) {
          affectedFieldKeys.push(getFieldPath(field, i))
        }
        break
      }
    }

    return Object.keys(formApi.fieldInfo).filter((fieldKey) =>
      affectedFieldKeys.some((key) => fieldKey.startsWith(key)),
    ) as DeepKeys<TFormData>[]
  }

  function updateIndex(
    fieldKey: string,
    direction: 'up' | 'down',
  ): DeepKeys<TFormData> {
    return fieldKey.replace(/\[(\d+)\]/, (_, num) => {
      const currIndex = parseInt(num, 10)
      const newIndex =
        direction === 'up' ? currIndex + 1 : Math.max(0, currIndex - 1)
      return `[${newIndex}]`
    }) as DeepKeys<TFormData>
  }

  function shiftMeta(fields: DeepKeys<TFormData>[], direction: 'up' | 'down') {
    const sortedFields = direction === 'up' ? fields : [...fields].reverse()

    sortedFields.forEach((fieldKey) => {
      const nextFieldKey = updateIndex(fieldKey.toString(), direction)
      const nextFieldMeta = formApi.getFieldMeta(nextFieldKey)
      if (nextFieldMeta) {
        formApi.setFieldMeta(fieldKey, nextFieldMeta)
      } else {
        formApi.setFieldMeta(fieldKey, getEmptyFieldMeta())
      }
    })
  }

  const getEmptyFieldMeta = (): AnyFieldMeta => defaultFieldMeta

  return {
    handleArrayMove,
    handleArrayRemove,
    handleArraySwap,
    handleArrayInsert,
  }
}
