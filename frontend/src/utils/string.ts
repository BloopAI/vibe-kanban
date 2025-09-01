/**
 * Converts SCREAMING_SNAKE_CASE to "Pretty Case"
 * @param value - The string to convert
 * @returns Formatted string with proper capitalization
 */
export const toPrettyCase = (value: string): string => {
  return value
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

/**
 * Generates a pretty project name from a file path
 * Converts directory names like "my-awesome-project" to "My Awesome Project"
 * @param path - The file path to extract name from
 * @returns Formatted project name
 */
export const generateProjectNameFromPath = (path: string): string => {
  const dirName = path.split('/').filter(Boolean).pop() || '';
  return dirName.replace(/[-_]/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
};
