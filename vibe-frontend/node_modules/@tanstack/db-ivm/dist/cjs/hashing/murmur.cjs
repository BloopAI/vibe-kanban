"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const RANDOM_SEED = randomHash();
const STRING_MARKER = randomHash();
const BIG_INT_MARKER = randomHash();
const NEG_BIG_INT_MARKER = randomHash();
const SYMBOL_MARKER = randomHash();
function randomHash() {
  return Math.random() * (2 ** 31 - 1) >>> 0;
}
const buf = new ArrayBuffer(8);
const dv = new DataView(buf);
const u8 = new Uint8Array(buf);
class MurmurHashStream {
  constructor() {
    this.hash = RANDOM_SEED;
    this.length = 0;
    this.carry = 0;
    this.carryBytes = 0;
  }
  _mix(k1) {
    k1 = Math.imul(k1, 3432918353);
    k1 = k1 << 15 | k1 >>> 17;
    k1 = Math.imul(k1, 461845907);
    this.hash ^= k1;
    this.hash = this.hash << 13 | this.hash >>> 19;
    this.hash = Math.imul(this.hash, 5) + 3864292196;
  }
  writeByte(byte) {
    this.carry |= (byte & 255) << 8 * this.carryBytes;
    this.carryBytes++;
    this.length++;
    if (this.carryBytes === 4) {
      this._mix(this.carry >>> 0);
      this.carry = 0;
      this.carryBytes = 0;
    }
  }
  update(chunk) {
    switch (typeof chunk) {
      case `symbol`: {
        this.update(SYMBOL_MARKER);
        const description = chunk.description;
        if (!description) {
          return;
        }
        for (let i = 0; i < description.length; i++) {
          const code = description.charCodeAt(i);
          this.writeByte(code & 255);
          this.writeByte(code >>> 8 & 255);
        }
        return;
      }
      case `string`:
        this.update(STRING_MARKER);
        for (let i = 0; i < chunk.length; i++) {
          const code = chunk.charCodeAt(i);
          this.writeByte(code & 255);
          this.writeByte(code >>> 8 & 255);
        }
        return;
      case `number`:
        dv.setFloat64(0, chunk, true);
        this.writeByte(u8[0]);
        this.writeByte(u8[1]);
        this.writeByte(u8[2]);
        this.writeByte(u8[3]);
        this.writeByte(u8[4]);
        this.writeByte(u8[5]);
        this.writeByte(u8[6]);
        this.writeByte(u8[7]);
        return;
      case `bigint`: {
        let value = chunk;
        if (value < 0n) {
          value = -value;
          this.update(NEG_BIG_INT_MARKER);
        } else {
          this.update(BIG_INT_MARKER);
        }
        while (value > 0n) {
          this.writeByte(Number(value & 0xffn));
          value >>= 8n;
        }
        if (chunk === 0n) this.writeByte(0);
        return;
      }
      default:
        throw new TypeError(`Unsupported input type: ${typeof chunk}`);
    }
  }
  digest() {
    if (this.carryBytes > 0) {
      let k1 = this.carry >>> 0;
      k1 = Math.imul(k1, 3432918353);
      k1 = k1 << 15 | k1 >>> 17;
      k1 = Math.imul(k1, 461845907);
      this.hash ^= k1;
    }
    this.hash ^= this.length;
    this.hash ^= this.hash >>> 16;
    this.hash = Math.imul(this.hash, 2246822507);
    this.hash ^= this.hash >>> 13;
    this.hash = Math.imul(this.hash, 3266489909);
    this.hash ^= this.hash >>> 16;
    return this.hash >>> 0;
  }
}
exports.MurmurHashStream = MurmurHashStream;
exports.randomHash = randomHash;
//# sourceMappingURL=murmur.cjs.map
