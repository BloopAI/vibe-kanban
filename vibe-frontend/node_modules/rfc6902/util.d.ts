export declare const hasOwnProperty: (v: PropertyKey) => boolean;
export declare function objectType(object: any): "string" | "number" | "bigint" | "boolean" | "symbol" | "undefined" | "object" | "function" | "null" | "array";
/**
Recursively copy a value.

@param source - should be a JavaScript primitive, Array, Date, or (plain old) Object.
@returns copy of source where every Array and Object have been recursively
         reconstructed from their constituent elements
*/
export declare function clone<T extends any>(source: T): T;
