/**
 * SaltyRTC chunked-dc protocol for reliable/ordered data channels.
 *
 * Each chunk has a 1-byte header:
 *   bits 7-3: reserved (0)
 *   bits 2-1: mode = 0b11 (reliable/ordered)
 *   bit    0: end-of-message (1 = last chunk)
 *
 * Port of crates/relay-webrtc/src/fragment.rs.
 */

const CHUNK_PAYLOAD_SIZE = 60 * 1024;
const BITFIELD_MORE = 0x06; // 0b0000_0110
const BITFIELD_END = 0x07; // 0b0000_0111

export function fragment(data: Uint8Array): Uint8Array[] {
  if (data.byteLength <= CHUNK_PAYLOAD_SIZE) {
    const chunk = new Uint8Array(1 + data.byteLength);
    chunk[0] = BITFIELD_END;
    chunk.set(data, 1);
    return [chunk];
  }

  const chunks: Uint8Array[] = [];
  let offset = 0;
  while (offset < data.byteLength) {
    const remaining = data.byteLength - offset;
    const payloadSize = Math.min(CHUNK_PAYLOAD_SIZE, remaining);
    const isLast = offset + payloadSize >= data.byteLength;

    const chunk = new Uint8Array(1 + payloadSize);
    chunk[0] = isLast ? BITFIELD_END : BITFIELD_MORE;
    chunk.set(data.subarray(offset, offset + payloadSize), 1);
    chunks.push(chunk);
    offset += payloadSize;
  }
  return chunks;
}

export class Defragmenter {
  private buffers: Uint8Array[] = [];
  private totalLength = 0;

  process(chunk: ArrayBuffer): Uint8Array | null {
    const data = new Uint8Array(chunk);
    if (data.byteLength === 0) return null;

    const header = data[0];
    const payload = data.subarray(1);
    const isEnd = (header & 0x01) !== 0;

    if (this.buffers.length === 0 && isEnd) {
      return payload.slice();
    }

    this.buffers.push(payload);
    this.totalLength += payload.byteLength;

    if (isEnd) {
      const result = new Uint8Array(this.totalLength);
      let offset = 0;
      for (const buf of this.buffers) {
        result.set(buf, offset);
        offset += buf.byteLength;
      }
      this.buffers = [];
      this.totalLength = 0;
      return result;
    }

    return null;
  }
}
