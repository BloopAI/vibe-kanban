// JSON value (per RFC 8259)
export type JSONValue =
    | string
    | number
    | boolean
    | null
    | JSONValue[]
    | { [key: string]: JSONValue };

// JSON Pointer (simplest form; could be branded for more safety)
export type JSONPointer = string;

// Individual operations
export interface AddOp {
    op: 'add';
    path: JSONPointer;
    value: JSONValue;
}

export interface RemoveOp {
    op: 'remove';
    path: JSONPointer;
}

export interface ReplaceOp {
    op: 'replace';
    path: JSONPointer;
    value: JSONValue;
}

export interface MoveOp {
    op: 'move';
    from: JSONPointer;
    path: JSONPointer;
}

export interface CopyOp {
    op: 'copy';
    from: JSONPointer;
    path: JSONPointer;
}

export interface TestOp {
    op: 'test';
    path: JSONPointer;
    value: JSONValue;
}

// Union of all patch operations
export type JSONPatchOperation =
    | AddOp
    | RemoveOp
    | ReplaceOp
    | MoveOp
    | CopyOp
    | TestOp;

// A patch document is an array of operations
export type JSONPatch = JSONPatchOperation[];
