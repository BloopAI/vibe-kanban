/**
 * A React component to view a PDF document
 *
 * @see https://react-pdf-viewer.dev
 * @license https://react-pdf-viewer.dev/license
 * @copyright 2019-2023 Nguyen Huu Phuoc <me@phuoc.ng>
 */

import type { Plugin } from '@react-pdf-viewer/core';
import { SpecialZoomLevel } from '@react-pdf-viewer/core';
import * as React from 'react';

// Types
export interface EnterFullScreenProps {
    children?(props: RenderEnterFullScreenProps): React.ReactElement;
}

export interface EnterFullScreenMenuItemProps {
    onClick(): void;
}

export interface RenderEnterFullScreenProps {
    onClick(): void;
}

export interface RenderExitFullScreenProps {
    onClick(): void;
}

// Plugin
export interface FullScreenPlugin extends Plugin {
    EnterFullScreen(props: EnterFullScreenProps): React.ReactElement;
    EnterFullScreenButton(): React.ReactElement;
    EnterFullScreenMenuItem: (props: EnterFullScreenMenuItemProps) => React.ReactElement;
}

export type Zoom = (scale: number | SpecialZoomLevel) => void;

export interface FullScreenPluginProps {
    enableShortcuts?: boolean;
    getFullScreenTarget?(pagesContainer: HTMLElement): HTMLElement;
    renderExitFullScreenButton?: (props: RenderExitFullScreenProps) => React.ReactElement;
    onEnterFullScreen?(zoom: Zoom): void;
    onExitFullScreen?(zoom: Zoom): void;
}

export function fullScreenPlugin(props?: FullScreenPluginProps): FullScreenPlugin;

// Components
export class ExitFullScreenIcon extends React.Component {}
export class FullScreenIcon extends React.Component {}
