export type Hash = number;
export declare function randomHash(): number;
export interface Hasher {
    update: (val: symbol | string | number | bigint) => void;
    digest: () => number;
}
/**
 * This implementation of Murmur hash uses a random initial seed and random markers.
 * This means that hashes aren't deterministic across app restarts.
 * This is intentional in the composites polyfill to be resistent to hash-flooding attacks
 * where malicious users would precompute lots of different objects whose hashes collide with each other.
 *
 * Currently, for ts/db-ivm this is fine because we don't persist client state.
 * However, when we will introduce persistence we will either need to store the seeds or remove the randomness
 * to ensure deterministic hashes across app restarts.
 */
export declare class MurmurHashStream implements Hasher {
    private hash;
    private length;
    private carry;
    private carryBytes;
    private _mix;
    writeByte(byte: number): void;
    update(chunk: symbol | string | number | bigint): void;
    digest(): number;
}
