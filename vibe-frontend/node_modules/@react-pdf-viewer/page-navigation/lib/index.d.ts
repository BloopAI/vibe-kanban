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
export interface CurrentPageLabelProps {
    children?: (props: RenderCurrentPageLabelProps) => React.ReactElement;
}

export interface RenderCurrentPageLabelProps {
    currentPage: number;
    numberOfPages: number;
    pageLabel: string;
}

export interface GoToPageMenuItemProps {
    onClick: () => void;
}

export interface GoToPageProps {
    children?: RenderGoToPage;
}

export interface RenderGoToPageProps {
    isDisabled: boolean;
    onClick: () => void;
}

export type RenderGoToPage = (props: RenderGoToPageProps) => React.ReactElement;

export interface RenderNumberOfPagesProps {
    numberOfPages: number;
}

export type RenderNumberOfPages = (props: RenderNumberOfPagesProps) => React.ReactElement;

export interface NumberOfPagesProps {
    children?: RenderNumberOfPages;
}

// Plugin
export interface PageNavigationPlugin extends Plugin {
    jumpToNextPage(): void;
    jumpToPage: (pageIndex: number) => void;
    jumpToPreviousPage(): void;
    CurrentPageInput: () => React.ReactElement;
    CurrentPageLabel: (props: CurrentPageLabelProps) => React.ReactElement;
    GoToFirstPage: (props: GoToPageProps) => React.ReactElement;
    GoToFirstPageButton: () => React.ReactElement;
    GoToFirstPageMenuItem: (props: GoToPageMenuItemProps) => React.ReactElement;
    GoToLastPage: (props: GoToPageProps) => React.ReactElement;
    GoToLastPageButton: () => React.ReactElement;
    GoToLastPageMenuItem: (props: GoToPageMenuItemProps) => React.ReactElement;
    GoToNextPage: (props: GoToPageProps) => React.ReactElement;
    GoToNextPageButton: () => React.ReactElement;
    GoToNextPageMenuItem: (props: GoToPageMenuItemProps) => React.ReactElement;
    GoToPreviousPage: (props: GoToPageProps) => React.ReactElement;
    GoToPreviousPageButton: () => React.ReactElement;
    GoToPreviousPageMenuItem: (props: GoToPageMenuItemProps) => React.ReactElement;
    NumberOfPages: (props: NumberOfPagesProps) => React.ReactElement;
}

export interface PageNavigationPluginProps {
    enableShortcuts?: boolean;
}

export function pageNavigationPlugin(props?: PageNavigationPluginProps): PageNavigationPlugin;

// Components
export class DownArrowIcon extends React.Component {}
export class NextIcon extends React.Component {}
export class PreviousIcon extends React.Component {}
export class UpArrowIcon extends React.Component {}
