/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

'use strict'
const LexicalCheckListPlugin = process.env.NODE_ENV !== 'production' ? require('./LexicalCheckListPlugin.dev.js') : require('./LexicalCheckListPlugin.prod.js');
module.exports = LexicalCheckListPlugin;