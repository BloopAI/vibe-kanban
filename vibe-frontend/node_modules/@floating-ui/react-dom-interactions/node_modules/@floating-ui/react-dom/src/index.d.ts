import type { ComputePositionConfig, ComputePositionReturn, Middleware, SideObject, VirtualElement } from '@floating-ui/core';
import { MutableRefObject } from 'react';
export * from '@floating-ui/dom';
declare type Data = Omit<ComputePositionReturn, 'x' | 'y'> & {
    x: number | null;
    y: number | null;
};
declare type ReferenceType = Element | VirtualElement;
export declare type UseFloatingReturn<RT extends ReferenceType = ReferenceType> = Data & {
    update: () => void;
    reference: (node: RT | null) => void;
    floating: (node: HTMLElement | null) => void;
    refs: {
        reference: MutableRefObject<RT | null>;
        floating: MutableRefObject<HTMLElement | null>;
    };
};
export declare function useFloating<RT extends ReferenceType = ReferenceType>({ middleware, placement, strategy, }?: Omit<Partial<ComputePositionConfig>, 'platform'>): UseFloatingReturn<RT>;
export declare const arrow: (options: {
    element: MutableRefObject<HTMLElement | null> | HTMLElement;
    padding?: number | SideObject;
}) => Middleware;
