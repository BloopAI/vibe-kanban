/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type { ElementFormatType } from './nodes/LexicalElementNode';
import type { TextDetailType, TextFormatType, TextModeType } from './nodes/LexicalTextNode';
export declare const DOM_ELEMENT_TYPE = 1;
export declare const DOM_TEXT_TYPE = 3;
export declare const DOM_DOCUMENT_TYPE = 9;
export declare const DOM_DOCUMENT_FRAGMENT_TYPE = 11;
export declare const NO_DIRTY_NODES = 0;
export declare const HAS_DIRTY_NODES = 1;
export declare const FULL_RECONCILE = 2;
export declare const IS_NORMAL = 0;
export declare const IS_TOKEN = 1;
export declare const IS_SEGMENTED = 2;
export declare const IS_BOLD = 1;
export declare const IS_ITALIC: number;
export declare const IS_STRIKETHROUGH: number;
export declare const IS_UNDERLINE: number;
export declare const IS_CODE: number;
export declare const IS_SUBSCRIPT: number;
export declare const IS_SUPERSCRIPT: number;
export declare const IS_HIGHLIGHT: number;
export declare const IS_LOWERCASE: number;
export declare const IS_UPPERCASE: number;
export declare const IS_CAPITALIZE: number;
export declare const IS_ALL_FORMATTING: number;
export declare const IS_DIRECTIONLESS = 1;
export declare const IS_UNMERGEABLE: number;
export declare const IS_ALIGN_LEFT = 1;
export declare const IS_ALIGN_CENTER = 2;
export declare const IS_ALIGN_RIGHT = 3;
export declare const IS_ALIGN_JUSTIFY = 4;
export declare const IS_ALIGN_START = 5;
export declare const IS_ALIGN_END = 6;
export declare const NON_BREAKING_SPACE = "\u00A0";
export declare const COMPOSITION_SUFFIX: string;
export declare const DOUBLE_LINE_BREAK = "\n\n";
export declare const COMPOSITION_START_CHAR: string;
export declare const RTL_REGEX: RegExp;
export declare const LTR_REGEX: RegExp;
export declare const TEXT_TYPE_TO_FORMAT: Record<TextFormatType | string, number>;
export declare const DETAIL_TYPE_TO_DETAIL: Record<TextDetailType | string, number>;
export declare const ELEMENT_TYPE_TO_FORMAT: Record<Exclude<ElementFormatType, ''>, number>;
export declare const ELEMENT_FORMAT_TO_TYPE: Record<number, ElementFormatType>;
export declare const TEXT_MODE_TO_TYPE: Record<TextModeType, 0 | 1 | 2>;
export declare const TEXT_TYPE_TO_MODE: Record<number, TextModeType>;
export declare const NODE_STATE_KEY = "$";
export declare const PROTOTYPE_CONFIG_METHOD = "$config";
