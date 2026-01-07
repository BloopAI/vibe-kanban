import { HotkeyCallback, Keys, OptionsOrDependencyArray } from './types';
export default function useHotkeys<T extends HTMLElement>(keys: Keys, callback: HotkeyCallback, options?: OptionsOrDependencyArray, dependencies?: OptionsOrDependencyArray): import('react').RefObject<T | null>;
