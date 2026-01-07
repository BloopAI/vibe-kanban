import React from 'react';
import type { FloatingContext } from './types';
declare type Delay = number | Partial<{
    open: number;
    close: number;
}>;
interface GroupState {
    delay: Delay;
    initialDelay: Delay;
    currentId: any;
}
interface GroupContext extends GroupState {
    setCurrentId: React.Dispatch<React.SetStateAction<any>>;
    setState: React.Dispatch<React.SetStateAction<GroupState>>;
}
export declare const useDelayGroupContext: () => GroupContext;
/**
 * Provides context for a group of floating elements that should share a
 * `delay`.
 * @see https://floating-ui.com/docs/FloatingDelayGroup
 */
export declare const FloatingDelayGroup: ({ children, delay, }: {
    children?: React.ReactNode;
    delay: Delay;
}) => JSX.Element;
interface UseGroupOptions {
    id: any;
}
export declare const useDelayGroup: ({ open, onOpenChange }: FloatingContext, { id }: UseGroupOptions) => void;
export {};
