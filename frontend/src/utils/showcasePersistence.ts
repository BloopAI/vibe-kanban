/**
 * Check if a user has seen a specific showcase version
 *
 * @param id - Unique identifier for the showcase
 * @param version - Version number for the showcase
 * @returns true if the user has seen this showcase version
 *
 * Storage key format: `showcase:{id}:v{version}:seen`
 */
export function hasSeen(id: string, version: number): boolean {
  const key = `showcase:${id}:v${version}:seen`;
  return localStorage.getItem(key) === 'true';
}

/**
 * Mark a showcase as seen
 *
 * @param id - Unique identifier for the showcase
 * @param version - Version number for the showcase
 *
 * Storage key format: `showcase:{id}:v{version}:seen`
 */
export function markSeen(id: string, version: number): void {
  const key = `showcase:${id}:v${version}:seen`;
  localStorage.setItem(key, 'true');
}
