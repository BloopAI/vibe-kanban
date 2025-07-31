/**
 * Converts SCREAMING_SNAKE_CASE to "Pretty Case"
 * @param value - The string to convert
 * @returns Formatted string with proper capitalization
 */
export const toPrettyCase = (value: string): string => {
  return value
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};
