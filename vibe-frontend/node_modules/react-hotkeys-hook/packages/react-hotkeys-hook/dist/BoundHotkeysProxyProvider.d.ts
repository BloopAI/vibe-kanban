import { ReactNode } from 'react';
import { Hotkey } from './types';
type BoundHotkeysProxyProviderType = {
    addHotkey: (hotkey: Hotkey) => void;
    removeHotkey: (hotkey: Hotkey) => void;
};
export declare const useBoundHotkeysProxy: () => BoundHotkeysProxyProviderType | undefined;
interface Props {
    children: ReactNode;
    addHotkey: (hotkey: Hotkey) => void;
    removeHotkey: (hotkey: Hotkey) => void;
}
export default function BoundHotkeysProxyProviderProvider({ addHotkey, removeHotkey, children }: Props): import("react/jsx-runtime").JSX.Element;
export {};
