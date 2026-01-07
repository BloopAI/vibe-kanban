let enableTransform = false;

const temp = (f: string) => f;

let transformContent = temp;

let transformFile = temp;

/**
 * ⚠️ **WARNING: DANGEROUS OPERATION** ⚠️
 *
 * This function modifies global state and may cause unexpected side effects.
 * You may also need escapeHTML for the content.
 *
 * @param fn - The transformation function to help transform template content
 * @throws {Error} Throws an error if the provided parameter is not a function
 *
 * @example
 * ```typescript
 * // Use with caution - this affects global behavior
 * setTransformForTemplateContent((content) => content.trim());
 * ```
 */
export const setTransformForTemplateContent = (fn: (content: string) => string) => {
  if (typeof fn !== "function") {
    throw new Error("Transform must be a function");
  }

  transformContent = fn;

  enableTransform = true;
};

/**
 * ⚠️ **WARNING: DANGEROUS OPERATION** ⚠️
 *
 * @param fn - The transformation function to apply to file content
 * @throws {Error} Throws an error if the provided parameter is not a function
 *
 * @example
 * ```typescript
 * // Use with caution - this affects global behavior
 * setTransformFile((content) => content.toUpperCase());
 * ```
 */
export const setTransformForFile = (fn: (content: string) => string) => {
  if (typeof fn !== "function") {
    throw new Error("Transform must be a function");
  }
  transformFile = fn;
  enableTransform = true;
};

/**
 * Resets all transformation functions to their default state and disables transformation.
 *
 * @example
 * ```typescript
 * resetTransform(); // Clears all transformations
 * ```
 */
export const resetTransform = () => {
  enableTransform = false;

  transformContent = temp;

  transformFile = temp;
};

/**
 * Checks whether content transformation is currently enabled.
 *
 * @returns {boolean} True if transformation is enabled, false otherwise
 *
 * @example
 * ```typescript
 * if (isTransformEnabled()) {
 *   console.log('Transformations are active');
 * }
 * ```
 */
export const isTransformEnabled = () => enableTransform;

/**
 * Applies the transformation function to the provided content if transformation is enabled.
 *
 * @param content - The content string to transform
 * @returns {string} The transformed content if transformation is enabled and configured, otherwise the original content
 *
 * @example
 * ```typescript
 * const transformed = processTransformTemplateContent('  hello world  ');
 * ```
 */
export const processTransformTemplateContent = (content: string) => {
  if (enableTransform && temp !== transformContent) {
    return transformContent(content);
  }
  return content;
};

/**
 * Applies the file transformation function to the provided content if transformation is enabled.
 *
 * @param content - The content string to transform
 * @returns {string} The transformed content if transformation is enabled and configured, otherwise the original content
 *
 * @example
 * ```typescript
 * const transformed = doTransformFile('some file content');
 * ```
 */
export const processTransformForFile = (content: string) => {
  if (enableTransform && temp !== transformFile) {
    return transformFile(content);
  }
  return content;
};
