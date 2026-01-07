/**
 * A React component to view a PDF document
 *
 * @see https://react-pdf-viewer.dev
 * @license https://react-pdf-viewer.dev/license
 * @copyright 2019-2023 Nguyen Huu Phuoc <me@phuoc.ng>
 */

import type { Plugin } from '@react-pdf-viewer/core';
import * as React from 'react';

// Types
export interface SwitchSelectionModeProps {
    children?: (props: RenderSwitchSelectionModeProps) => React.ReactElement;
    mode: SelectionMode;
}

export interface RenderSwitchSelectionModeProps {
    isSelected: boolean;
    mode: SelectionMode;
    onClick(): void;
}

export interface SwitchSelectionModeButtonProps {
    mode: SelectionMode;
}

export interface SwitchSelectionModeMenuItemProps {
    mode: SelectionMode;
    onClick(): void;
}

// Structs
export enum SelectionMode {
    Hand = 'Hand',
    Text = 'Text',
}

// Plugin
export interface SelectionModePlugin extends Plugin {
    SwitchSelectionMode(props: SwitchSelectionModeProps): React.ReactElement;
    SwitchSelectionModeButton(props: SwitchSelectionModeButtonProps): React.ReactElement;
    SwitchSelectionModeMenuItem(props: SwitchSelectionModeMenuItemProps): React.ReactElement;
}

export interface SelectionModePluginProps {
    selectionMode?: SelectionMode;
}

export function selectionModePlugin(props?: SelectionModePluginProps): SelectionModePlugin;

// Components
export class HandToolIcon extends React.Component {}
export class TextSelectionIcon extends React.Component {}
