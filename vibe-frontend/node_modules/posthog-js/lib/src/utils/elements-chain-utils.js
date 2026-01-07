"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractHref = extractHref;
exports.extractTexts = extractTexts;
exports.matchString = matchString;
exports.matchTexts = matchTexts;
var core_1 = require("@posthog/core");
function extractHref(elementsChain) {
    var match = elementsChain.match(/(?::|")href="(.*?)"/);
    return match ? match[1] : '';
}
function extractTexts(elementsChain) {
    var texts = [];
    var regex = /(?::|")text="(.*?)"/g;
    var match;
    while (!(0, core_1.isNullish)((match = regex.exec(elementsChain)))) {
        if (!texts.includes(match[1])) {
            texts.push(match[1]);
        }
    }
    return texts;
}
function matchString(value, pattern, matching) {
    if ((0, core_1.isNullish)(value))
        return false;
    switch (matching) {
        case 'exact':
            return value === pattern;
        case 'contains': {
            // Simulating SQL LIKE behavior (_ = any single character, % = any zero or more characters)
            var likePattern = pattern
                .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                .replace(/_/g, '.')
                .replace(/%/g, '.*');
            return new RegExp(likePattern, 'i').test(value);
        }
        case 'regex':
            try {
                return new RegExp(pattern).test(value);
            }
            catch (_a) {
                return false;
            }
        default:
            return false;
    }
}
function matchTexts(texts, pattern, matching) {
    return texts.some(function (text) { return matchString(text, pattern, matching); });
}
//# sourceMappingURL=elements-chain-utils.js.map