/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type { LexicalEditor } from 'lexical';
import type { JSX } from 'react';
import * as React from 'react';
type ErrorBoundaryProps = {
    children: JSX.Element;
    onError: (error: Error) => void;
};
export type ErrorBoundaryType = React.ComponentClass<ErrorBoundaryProps> | React.FC<ErrorBoundaryProps>;
export declare function useDecorators(editor: LexicalEditor, ErrorBoundary: ErrorBoundaryType): Array<JSX.Element>;
export {};
