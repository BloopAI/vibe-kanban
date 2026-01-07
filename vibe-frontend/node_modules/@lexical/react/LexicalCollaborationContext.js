/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

'use strict'
const LexicalCollaborationContext = process.env.NODE_ENV !== 'production' ? require('./LexicalCollaborationContext.dev.js') : require('./LexicalCollaborationContext.prod.js');
module.exports = LexicalCollaborationContext;