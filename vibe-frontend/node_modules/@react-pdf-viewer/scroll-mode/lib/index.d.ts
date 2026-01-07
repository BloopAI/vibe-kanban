/**
 * A React component to view a PDF document
 *
 * @see https://react-pdf-viewer.dev
 * @license https://react-pdf-viewer.dev/license
 * @copyright 2019-2023 Nguyen Huu Phuoc <me@phuoc.ng>
 */

import type { Plugin } from '@react-pdf-viewer/core';
import { ScrollMode, ViewMode } from '@react-pdf-viewer/core';
import * as React from 'react';

// Types
export interface SwitchScrollModeProps {
    children?: (props: RenderSwitchScrollModeProps) => React.ReactElement;
    mode: ScrollMode;
}

export interface RenderSwitchScrollModeProps {
    isDisabled: boolean;
    isSelected: boolean;
    mode: ScrollMode;
    onClick(): void;
}

export interface SwitchScrollModeButtonProps {
    mode: ScrollMode;
}

export interface SwitchScrollModeMenuItemProps {
    mode: ScrollMode;
    onClick(): void;
}

export interface SwitchViewModeProps {
    children?: (props: RenderSwitchViewModeProps) => React.ReactElement;
    mode: ViewMode;
}

export interface RenderSwitchViewModeProps {
    isDisabled: boolean;
    isSelected: boolean;
    mode: ViewMode;
    onClick(): void;
}

export interface SwitchViewModeButtonProps {
    mode: ViewMode;
}

export interface SwitchViewModeMenuItemProps {
    mode: ViewMode;
    onClick(): void;
}

// Plugin
export interface ScrollModePlugin extends Plugin {
    switchScrollMode(mode: ScrollMode): void;
    SwitchScrollMode(props: SwitchScrollModeProps): React.ReactElement;
    SwitchScrollModeButton(props: SwitchScrollModeButtonProps): React.ReactElement;
    SwitchScrollModeMenuItem(props: SwitchScrollModeMenuItemProps): React.ReactElement;

    switchViewMode(mode: ViewMode): void;
    SwitchViewMode(props: SwitchViewModeProps): React.ReactElement;
    SwitchViewModeButton(props: SwitchViewModeButtonProps): React.ReactElement;
    SwitchViewModeMenuItem(props: SwitchViewModeMenuItemProps): React.ReactElement;
}

export function scrollModePlugin(): ScrollModePlugin;

// Components
export class DualPageViewModeIcon extends React.Component {}
export class DualPageCoverViewModeIcon extends React.Component {}
export class HorizontalScrollingIcon extends React.Component {}
export class PageScrollingIcon extends React.Component {}
export class VerticalScrollingIcon extends React.Component {}
export class WrappedScrollingIcon extends React.Component {}
