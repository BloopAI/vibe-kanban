export interface DeviceCode {
  readonly url: string;
  readonly code: string;
}

const URL_PATTERN = /https?:\/\/[^\s'"<>]+/;
// GitHub prints `ABCD-1234`, other device flows use longer groups
const CODE_PATTERN = /\b[A-Z0-9]{4,}(?:-[A-Z0-9]{4,})+\b/;

/**
 * Finds an OAuth device-flow prompt ("visit <url> and enter code <code>") in a
 * login script's output, so the conversation can show it without opening logs.
 * Returns null unless both a link and a code are present.
 */
export function parseDeviceCode(output: string): DeviceCode | null {
  for (const line of output.split('\n')) {
    const url = line.match(URL_PATTERN)?.[0].replace(/[.,;:)]+$/, '');
    const code = line.replace(URL_PATTERN, '').match(CODE_PATTERN)?.[0];
    if (url && code) return { url, code };
  }
  return null;
}
