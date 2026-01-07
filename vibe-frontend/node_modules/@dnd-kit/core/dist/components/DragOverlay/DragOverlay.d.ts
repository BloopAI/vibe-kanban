import React from 'react';
import { Modifiers } from '../../modifiers';
import type { PositionedOverlayProps } from './components';
import type { DropAnimation } from './hooks';
export interface Props extends Pick<PositionedOverlayProps, 'adjustScale' | 'children' | 'className' | 'style' | 'transition'> {
    dropAnimation?: DropAnimation | null | undefined;
    modifiers?: Modifiers;
    wrapperElement?: keyof JSX.IntrinsicElements;
    zIndex?: number;
}
export declare const DragOverlay: React.MemoExoticComponent<({ adjustScale, children, dropAnimation: dropAnimationConfig, style, transition, modifiers, wrapperElement, className, zIndex, }: Props) => JSX.Element>;
