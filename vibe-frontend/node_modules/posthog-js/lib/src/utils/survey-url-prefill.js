"use strict";
var __values = (this && this.__values) || function(o) {
    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    if (m) return m.call(o);
    if (o && typeof o.length === "number") return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
};
var __read = (this && this.__read) || function (o, n) {
    var m = typeof Symbol === "function" && o[Symbol.iterator];
    if (!m) return o;
    var i = m.call(o), r, ar = [], e;
    try {
        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
    }
    catch (error) { e = { error: error }; }
    finally {
        try {
            if (r && !r.done && (m = i["return"])) m.call(i);
        }
        finally { if (e) throw e.error; }
    }
    return ar;
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractPrefillParamsFromUrl = extractPrefillParamsFromUrl;
exports.convertPrefillToResponses = convertPrefillToResponses;
exports.calculatePrefillStartIndex = calculatePrefillStartIndex;
var posthog_surveys_types_1 = require("../posthog-surveys-types");
var surveys_extension_utils_1 = require("../extensions/surveys/surveys-extension-utils");
var logger_1 = require("./logger");
var core_1 = require("@posthog/core");
/**
 * Extract prefill parameters from URL search string
 * Format: ?q0=1&q1=8&q2=0&q2=2&auto_submit=true
 * NOTE: Manual parsing for IE11/op_mini compatibility (no URLSearchParams)
 */
function extractPrefillParamsFromUrl(searchString) {
    var e_1, _a;
    var params = {};
    var autoSubmit = false;
    // Remove leading ? if present
    var cleanSearch = searchString.replace(/^\?/, '');
    if (!cleanSearch) {
        return { params: params, autoSubmit: autoSubmit };
    }
    // Split by & to get key-value pairs
    var pairs = cleanSearch.split('&');
    try {
        for (var pairs_1 = __values(pairs), pairs_1_1 = pairs_1.next(); !pairs_1_1.done; pairs_1_1 = pairs_1.next()) {
            var pair = pairs_1_1.value;
            var _b = __read(pair.split('='), 2), key = _b[0], value = _b[1];
            if (!key || (0, core_1.isUndefined)(value)) {
                continue;
            }
            var decodedKey = decodeURIComponent(key);
            var decodedValue = decodeURIComponent(value);
            // Check for auto_submit parameter
            if (decodedKey === 'auto_submit' && decodedValue === 'true') {
                autoSubmit = true;
                continue;
            }
            // Check for question parameters (q0, q1, etc.)
            var match = decodedKey.match(/^q(\d+)$/);
            if (match) {
                var questionIndex = parseInt(match[1], 10);
                if (!params[questionIndex]) {
                    params[questionIndex] = [];
                }
                params[questionIndex].push(decodedValue);
            }
        }
    }
    catch (e_1_1) { e_1 = { error: e_1_1 }; }
    finally {
        try {
            if (pairs_1_1 && !pairs_1_1.done && (_a = pairs_1.return)) _a.call(pairs_1);
        }
        finally { if (e_1) throw e_1.error; }
    }
    return { params: params, autoSubmit: autoSubmit };
}
/**
 * Convert URL prefill values to SDK response format
 */
function convertPrefillToResponses(survey, prefillParams) {
    var responses = {};
    survey.questions.forEach(function (question, index) {
        if (!prefillParams[index] || !question.id) {
            return;
        }
        var values = prefillParams[index];
        var responseKey = (0, surveys_extension_utils_1.getSurveyResponseKey)(question.id);
        try {
            switch (question.type) {
                case posthog_surveys_types_1.SurveyQuestionType.SingleChoice: {
                    if (!question.choices || question.choices.length === 0) {
                        logger_1.logger.warn("[Survey Prefill] Question ".concat(index, " has no choices"));
                        return;
                    }
                    var choiceIndex = parseInt(values[0], 10);
                    if (isNaN(choiceIndex) || choiceIndex < 0 || choiceIndex >= question.choices.length) {
                        logger_1.logger.warn("[Survey Prefill] Invalid choice index for q".concat(index, ": ").concat(values[0]));
                        return;
                    }
                    responses[responseKey] = question.choices[choiceIndex];
                    break;
                }
                case posthog_surveys_types_1.SurveyQuestionType.MultipleChoice: {
                    if (!question.choices || question.choices.length === 0) {
                        logger_1.logger.warn("[Survey Prefill] Question ".concat(index, " has no choices"));
                        return;
                    }
                    var choiceIndices = values
                        .map(function (v) { return parseInt(v, 10); })
                        .filter(function (i) { return !isNaN(i) && i >= 0 && i < question.choices.length; });
                    if (choiceIndices.length === 0) {
                        logger_1.logger.warn("[Survey Prefill] No valid choices for q".concat(index));
                        return;
                    }
                    // Remove duplicates and map to choice values
                    var uniqueChoices = __spreadArray([], __read(new Set(choiceIndices.map(function (i) { return question.choices[i]; }))), false);
                    if (uniqueChoices.length < choiceIndices.length) {
                        logger_1.logger.warn("[Survey Prefill] Removed duplicate choices for q".concat(index));
                    }
                    responses[responseKey] = uniqueChoices;
                    break;
                }
                case posthog_surveys_types_1.SurveyQuestionType.Rating: {
                    var rating = parseInt(values[0], 10);
                    var scale = question.scale || 10;
                    if (isNaN(rating) || rating < 0 || rating > scale) {
                        logger_1.logger.warn("[Survey Prefill] Invalid rating for q".concat(index, ": ").concat(values[0], " (scale: 0-").concat(scale, ")"));
                        return;
                    }
                    responses[responseKey] = rating;
                    break;
                }
                default:
                    logger_1.logger.info("[Survey Prefill] Question type ".concat(question.type, " does not support prefill"));
            }
        }
        catch (error) {
            logger_1.logger.error("[Survey Prefill] Error converting q".concat(index, ":"), error);
        }
    });
    return responses;
}
/**
 * Calculate which question index to start at based on prefilled questions.
 * Only advances past consecutive prefilled questions (starting from index 0)
 * that have skipSubmitButton enabled.
 *
 * @param questions - The survey questions array
 * @param prefilledIndices - Array of question indices that have been prefilled
 * @returns Object with startQuestionIndex and map of questions which have been skipped
 */
function calculatePrefillStartIndex(questions, prefilledIndices, responses) {
    var startQuestionIndex = 0;
    var skippedResponses = {};
    for (var i = 0; i < questions.length; i++) {
        // stop at the first question that is not prefilled
        if (!prefilledIndices.includes(i)) {
            break;
        }
        var question = questions[i];
        // only advance if the prefilled question has skipSubmitButton
        if (question && 'skipSubmitButton' in question && question.skipSubmitButton) {
            startQuestionIndex = i + 1;
            if (!question.id)
                continue;
            var responseKey = (0, surveys_extension_utils_1.getSurveyResponseKey)(question.id);
            if (!(0, core_1.isUndefined)(responses[responseKey])) {
                skippedResponses[responseKey] = responses[responseKey];
            }
        }
        else {
            // show question if skipSubmitButton is false, even if prefilled
            break;
        }
    }
    return { startQuestionIndex: startQuestionIndex, skippedResponses: skippedResponses };
}
//# sourceMappingURL=survey-url-prefill.js.map