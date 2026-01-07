import { NameGeneratorFunction, FieldPathList } from './types';

/**
 * Generates bracketed names
 * Example: root[tasks][0][title]
 * For multi-value fields (checkboxes, multi-select): root[hobbies][]
 */
export const bracketNameGenerator: NameGeneratorFunction = (
  path: FieldPathList,
  idPrefix: string,
  isMultiValue?: boolean,
): string => {
  if (!path || path.length === 0) {
    return idPrefix;
  }

  const baseName = path.reduce<string>((acc, pathUnit, index) => {
    if (index === 0) {
      return `${idPrefix}[${String(pathUnit)}]`;
    }
    return `${acc}[${String(pathUnit)}]`;
  }, '');

  // For multi-value fields, append [] to allow multiple values with the same name
  return isMultiValue ? `${baseName}[]` : baseName;
};

/**
 * Generates dot-notation names
 * Example: root.tasks.0.title
 * Multi-value fields are handled the same as single-value fields in dot notation
 */
export const dotNotationNameGenerator: NameGeneratorFunction = (
  path: FieldPathList,
  idPrefix: string,
  _isMultiValue?: boolean,
): string => {
  if (!path || path.length === 0) {
    return idPrefix;
  }

  return `${idPrefix}.${path.map(String).join('.')}`;
};
