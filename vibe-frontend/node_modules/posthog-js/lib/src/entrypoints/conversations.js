"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var external_1 = require("../extensions/conversations/external");
var globals_1 = require("../utils/globals");
globals_1.assignableWindow.__PosthogExtensions__ = globals_1.assignableWindow.__PosthogExtensions__ || {};
globals_1.assignableWindow.__PosthogExtensions__.initConversations = external_1.initConversations;
exports.default = external_1.initConversations;
//# sourceMappingURL=conversations.js.map