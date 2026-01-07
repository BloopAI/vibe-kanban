const defaultFieldMeta = {
  isValidating: false,
  isTouched: false,
  isBlurred: false,
  isDirty: false,
  isPristine: true,
  isValid: true,
  isDefaultValue: true,
  errors: [],
  errorMap: {},
  errorSourceMap: {}
};
function metaHelper(formApi) {
  function handleArrayMove(field, fromIndex, toIndex) {
    const affectedFields = getAffectedFields(field, fromIndex, "move", toIndex);
    const startIndex = Math.min(fromIndex, toIndex);
    const endIndex = Math.max(fromIndex, toIndex);
    for (let i = startIndex; i <= endIndex; i++) {
      affectedFields.push(getFieldPath(field, i));
    }
    const fromFields = Object.keys(formApi.fieldInfo).reduce(
      (fieldMap, fieldKey) => {
        if (fieldKey.startsWith(getFieldPath(field, fromIndex))) {
          fieldMap.set(
            fieldKey,
            formApi.getFieldMeta(fieldKey)
          );
        }
        return fieldMap;
      },
      /* @__PURE__ */ new Map()
    );
    shiftMeta(affectedFields, fromIndex < toIndex ? "up" : "down");
    Object.keys(formApi.fieldInfo).filter((fieldKey) => fieldKey.startsWith(getFieldPath(field, toIndex))).forEach((fieldKey) => {
      const fromKey = fieldKey.replace(
        getFieldPath(field, toIndex),
        getFieldPath(field, fromIndex)
      );
      const fromMeta = fromFields.get(fromKey);
      if (fromMeta) {
        formApi.setFieldMeta(fieldKey, fromMeta);
      }
    });
  }
  function handleArrayRemove(field, index) {
    const affectedFields = getAffectedFields(field, index, "remove");
    shiftMeta(affectedFields, "up");
  }
  function handleArraySwap(field, index, secondIndex) {
    const affectedFields = getAffectedFields(field, index, "swap", secondIndex);
    affectedFields.forEach((fieldKey) => {
      if (!fieldKey.toString().startsWith(getFieldPath(field, index))) {
        return;
      }
      const swappedKey = fieldKey.toString().replace(
        getFieldPath(field, index),
        getFieldPath(field, secondIndex)
      );
      const [meta1, meta2] = [
        formApi.getFieldMeta(fieldKey),
        formApi.getFieldMeta(swappedKey)
      ];
      if (meta1) formApi.setFieldMeta(swappedKey, meta1);
      if (meta2) formApi.setFieldMeta(fieldKey, meta2);
    });
  }
  function handleArrayInsert(field, insertIndex) {
    const affectedFields = getAffectedFields(field, insertIndex, "insert");
    shiftMeta(affectedFields, "down");
    affectedFields.forEach((fieldKey) => {
      if (fieldKey.toString().startsWith(getFieldPath(field, insertIndex))) {
        formApi.setFieldMeta(fieldKey, getEmptyFieldMeta());
      }
    });
  }
  function getFieldPath(field, index) {
    return `${field}[${index}]`;
  }
  function getAffectedFields(field, index, mode, secondIndex) {
    const affectedFieldKeys = [getFieldPath(field, index)];
    switch (mode) {
      case "swap":
        affectedFieldKeys.push(getFieldPath(field, secondIndex));
        break;
      case "move": {
        const [startIndex, endIndex] = [
          Math.min(index, secondIndex),
          Math.max(index, secondIndex)
        ];
        for (let i = startIndex; i <= endIndex; i++) {
          affectedFieldKeys.push(getFieldPath(field, i));
        }
        break;
      }
      default: {
        const currentValue = formApi.getFieldValue(field);
        const fieldItems = Array.isArray(currentValue) ? currentValue.length : 0;
        for (let i = index + 1; i < fieldItems; i++) {
          affectedFieldKeys.push(getFieldPath(field, i));
        }
        break;
      }
    }
    return Object.keys(formApi.fieldInfo).filter(
      (fieldKey) => affectedFieldKeys.some((key) => fieldKey.startsWith(key))
    );
  }
  function updateIndex(fieldKey, direction) {
    return fieldKey.replace(/\[(\d+)\]/, (_, num) => {
      const currIndex = parseInt(num, 10);
      const newIndex = direction === "up" ? currIndex + 1 : Math.max(0, currIndex - 1);
      return `[${newIndex}]`;
    });
  }
  function shiftMeta(fields, direction) {
    const sortedFields = direction === "up" ? fields : [...fields].reverse();
    sortedFields.forEach((fieldKey) => {
      const nextFieldKey = updateIndex(fieldKey.toString(), direction);
      const nextFieldMeta = formApi.getFieldMeta(nextFieldKey);
      if (nextFieldMeta) {
        formApi.setFieldMeta(fieldKey, nextFieldMeta);
      } else {
        formApi.setFieldMeta(fieldKey, getEmptyFieldMeta());
      }
    });
  }
  const getEmptyFieldMeta = () => defaultFieldMeta;
  return {
    handleArrayMove,
    handleArrayRemove,
    handleArraySwap,
    handleArrayInsert
  };
}
export {
  defaultFieldMeta,
  metaHelper
};
//# sourceMappingURL=metaHelper.js.map
