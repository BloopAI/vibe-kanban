/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

'use strict'
const LexicalDraggableBlockPlugin = process.env.NODE_ENV !== 'production' ? require('./LexicalDraggableBlockPlugin.dev.js') : require('./LexicalDraggableBlockPlugin.prod.js');
module.exports = LexicalDraggableBlockPlugin;