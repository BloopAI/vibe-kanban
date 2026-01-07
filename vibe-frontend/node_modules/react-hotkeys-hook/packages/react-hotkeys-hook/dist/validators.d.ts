import { FormTags, Hotkey, Scopes, Trigger } from './types';
export declare function maybePreventDefault(e: KeyboardEvent, hotkey: Hotkey, preventDefault?: Trigger): void;
export declare function isHotkeyEnabled(e: KeyboardEvent, hotkey: Hotkey, enabled?: Trigger): boolean;
export declare function isKeyboardEventTriggeredByInput(ev: KeyboardEvent): boolean;
export declare function isHotkeyEnabledOnTag(event: KeyboardEvent, enabledOnTags?: readonly FormTags[] | boolean): boolean;
export declare function isCustomElement(element: HTMLElement): boolean;
export declare function isScopeActive(activeScopes: string[], scopes?: Scopes): boolean;
export declare const isHotkeyMatchingKeyboardEvent: (e: KeyboardEvent, hotkey: Hotkey, ignoreModifiers?: boolean) => boolean;
