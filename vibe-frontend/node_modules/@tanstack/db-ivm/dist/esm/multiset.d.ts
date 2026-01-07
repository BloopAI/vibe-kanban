export type MultiSetArray<T> = Array<[T, number]>;
export type KeyedData<T> = [key: string, value: T];
/**
 * A multiset of data.
 */
export declare class MultiSet<T> {
    #private;
    constructor(data?: MultiSetArray<T>);
    toString(indent?: boolean): string;
    toJSON(): string;
    static fromJSON<U>(json: string): MultiSet<U>;
    /**
     * Apply a function to all records in the collection.
     */
    map<U>(f: (data: T) => U): MultiSet<U>;
    /**
     * Filter out records for which a function f(record) evaluates to False.
     */
    filter(f: (data: T) => boolean): MultiSet<T>;
    /**
     * Negate all multiplicities in the collection.
     */
    negate(): MultiSet<T>;
    /**
     * Concatenate two collections together.
     */
    concat(other: MultiSet<T>): MultiSet<T>;
    /**
     * Produce as output a collection that is logically equivalent to the input
     * but which combines identical instances of the same record into one
     * (record, multiplicity) pair.
     */
    consolidate(): MultiSet<T>;
    extend(other: MultiSet<T> | MultiSetArray<T>): void;
    add(item: T, multiplicity: number): void;
    getInner(): MultiSetArray<T>;
}
