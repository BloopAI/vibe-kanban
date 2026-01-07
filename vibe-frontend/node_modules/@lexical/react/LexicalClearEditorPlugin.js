/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

'use strict'
const LexicalClearEditorPlugin = process.env.NODE_ENV !== 'production' ? require('./LexicalClearEditorPlugin.dev.js') : require('./LexicalClearEditorPlugin.prod.js');
module.exports = LexicalClearEditorPlugin;