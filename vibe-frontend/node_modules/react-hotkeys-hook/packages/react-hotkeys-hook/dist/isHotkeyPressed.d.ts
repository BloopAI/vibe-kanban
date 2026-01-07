export declare function isReadonlyArray(value: unknown): value is readonly unknown[];
export declare function isHotkeyPressed(key: string | readonly string[], delimiter?: string): boolean;
export declare function pushToCurrentlyPressedKeys(key: string | string[]): void;
export declare function removeFromCurrentlyPressedKeys(key: string | string[]): void;
