/**
 * Utility functions for processing execution logs
 */

/**
 * Filters out internal stderr boundary markers from raw output
 * These markers are used internally to separate stderr chunks but should not be visible to users
 */
export function filterStderrBoundaryMarkers(text: string): string {
  return text.replace(/---STDERR_CHUNK_BOUNDARY---\n?/g, '');
}