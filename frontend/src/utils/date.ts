/**
 * Format a date string as "Jan 5, 10:30 AM".
 */
export function formatDateShortWithTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
