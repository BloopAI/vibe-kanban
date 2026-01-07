import React from 'react';
import type { UniqueIdentifier } from '../../../../types';
export declare type Animation = (key: UniqueIdentifier, node: HTMLElement) => Promise<void> | void;
export interface Props {
    animation: Animation;
    children: React.ReactElement | null;
}
export declare function AnimationManager({ animation, children }: Props): JSX.Element;
