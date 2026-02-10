function fillBytesWithMathRandom(bytes: Uint8Array): void {
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
}

function formatUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'));
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-');
}

export function generateUuid(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    fillBytesWithMathRandom(bytes);
  }

  // Force RFC 4122 v4 version and variant bits.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return formatUuid(bytes);
}
