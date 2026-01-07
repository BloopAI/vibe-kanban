import { DependencyList } from 'react';
export type FormTags = 'input' | 'textarea' | 'select' | 'INPUT' | 'TEXTAREA' | 'SELECT' | 'searchbox' | 'slider' | 'spinbutton' | 'menuitem' | 'menuitemcheckbox' | 'menuitemradio' | 'option' | 'radio' | 'textbox';
export type Keys = string | readonly string[];
export type Scopes = string | readonly string[];
export type EventListenerOptions = {
    capture?: boolean;
    once?: boolean;
    passive?: boolean;
    signal?: AbortSignal;
} | boolean;
export type KeyboardModifiers = {
    alt?: boolean;
    ctrl?: boolean;
    meta?: boolean;
    shift?: boolean;
    mod?: boolean;
    useKey?: boolean;
};
export type Hotkey = KeyboardModifiers & {
    keys?: readonly string[];
    scopes?: Scopes;
    description?: string;
    isSequence?: boolean;
    hotkey: string;
};
export type HotkeysEvent = Hotkey;
export type HotkeyCallback = (keyboardEvent: KeyboardEvent, hotkeysEvent: HotkeysEvent) => void;
export type Trigger = boolean | ((keyboardEvent: KeyboardEvent, hotkeysEvent: HotkeysEvent) => boolean);
export type Options = {
    enabled?: Trigger;
    enableOnFormTags?: readonly FormTags[] | boolean;
    enableOnContentEditable?: boolean;
    ignoreEventWhen?: (e: KeyboardEvent) => boolean;
    splitKey?: string;
    delimiter?: string;
    scopes?: Scopes;
    keyup?: boolean;
    keydown?: boolean;
    preventDefault?: Trigger;
    description?: string;
    document?: Document;
    ignoreModifiers?: boolean;
    eventListenerOptions?: EventListenerOptions;
    useKey?: boolean;
    sequenceTimeoutMs?: number;
    sequenceSplitKey?: string;
};
export type OptionsOrDependencyArray = Options | DependencyList;
