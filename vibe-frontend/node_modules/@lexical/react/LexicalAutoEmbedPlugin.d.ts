/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type { CommandListenerPriority, LexicalNode } from 'lexical';
import type { JSX } from 'react';
import { MenuOption, MenuRenderFn } from '@lexical/react/LexicalNodeMenuPlugin';
import { LexicalCommand, LexicalEditor } from 'lexical';
export type EmbedMatchResult<TEmbedMatchResult = unknown> = {
    url: string;
    id: string;
    data?: TEmbedMatchResult;
};
export interface EmbedConfig<TEmbedMatchResultData = unknown, TEmbedMatchResult = EmbedMatchResult<TEmbedMatchResultData>> {
    type: string;
    parseUrl: (text: string) => Promise<TEmbedMatchResult | null> | TEmbedMatchResult | null;
    insertNode: (editor: LexicalEditor, result: TEmbedMatchResult) => void;
}
export declare const URL_MATCHER: RegExp;
export declare const INSERT_EMBED_COMMAND: LexicalCommand<EmbedConfig['type']>;
export declare class AutoEmbedOption extends MenuOption {
    title: string;
    onSelect: (targetNode: LexicalNode | null) => void;
    constructor(title: string, options: {
        onSelect: (targetNode: LexicalNode | null) => void;
    });
}
type LexicalAutoEmbedPluginProps<TEmbedConfig extends EmbedConfig> = {
    embedConfigs: Array<TEmbedConfig>;
    onOpenEmbedModalForConfig: (embedConfig: TEmbedConfig) => void;
    getMenuOptions: (activeEmbedConfig: TEmbedConfig, embedFn: () => void, dismissFn: () => void) => Array<AutoEmbedOption>;
    menuRenderFn: MenuRenderFn<AutoEmbedOption>;
    menuCommandPriority?: CommandListenerPriority;
};
export declare function LexicalAutoEmbedPlugin<TEmbedConfig extends EmbedConfig>({ embedConfigs, onOpenEmbedModalForConfig, getMenuOptions, menuRenderFn, menuCommandPriority, }: LexicalAutoEmbedPluginProps<TEmbedConfig>): JSX.Element | null;
export {};
