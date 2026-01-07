import React from 'react';
import type { Transform } from '@dnd-kit/utilities';
import type { ClientRect, UniqueIdentifier } from '../../../../types';
declare type TransitionGetter = (activatorEvent: Event | null) => React.CSSProperties['transition'] | undefined;
export interface Props {
    as: keyof JSX.IntrinsicElements;
    activatorEvent: Event | null;
    adjustScale?: boolean;
    children?: React.ReactNode;
    className?: string;
    id: UniqueIdentifier;
    rect: ClientRect | null;
    style?: React.CSSProperties;
    transition?: string | TransitionGetter;
    transform: Transform;
}
export declare const PositionedOverlay: React.ForwardRefExoticComponent<Props & React.RefAttributes<HTMLElement>>;
export {};
