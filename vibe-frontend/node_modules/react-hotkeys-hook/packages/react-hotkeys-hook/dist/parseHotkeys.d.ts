import { Hotkey } from './types';
export declare function mapCode(key: string): string;
export declare function isHotkeyModifier(key: string): boolean;
export declare function parseKeysHookInput(keys: string, delimiter?: string): string[];
export declare function parseHotkey(hotkey: string, splitKey?: string, sequenceSplitKey?: string, useKey?: boolean, description?: string): Hotkey;
