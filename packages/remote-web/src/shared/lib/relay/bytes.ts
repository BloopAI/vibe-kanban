export const TEXT_ENCODER = new TextEncoder();
export const TEXT_DECODER = new TextDecoder();

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const value of bytes) {
    binary += String.fromCharCode(value);
  }
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

export async function sha256Base64(bytes: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    toArrayBuffer(bytes),
  );
  return bytesToBase64(new Uint8Array(hashBuffer));
}
