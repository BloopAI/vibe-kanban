"use strict";
/**
 * Having Survey types in types.ts was confusing tsc
 * and generating an invalid module.d.ts
 * See https://github.com/PostHog/posthog-js/issues/698
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DisplaySurveyType = exports.SurveyEventProperties = exports.SurveyEventName = exports.SurveySchedule = exports.SurveyQuestionBranchingType = exports.SurveyQuestionType = exports.SurveyType = exports.SurveyTabPosition = exports.SurveyPosition = exports.SurveyWidgetType = exports.SurveyEventType = void 0;
var SurveyEventType;
(function (SurveyEventType) {
    SurveyEventType["Activation"] = "events";
    SurveyEventType["Cancellation"] = "cancelEvents";
})(SurveyEventType || (exports.SurveyEventType = SurveyEventType = {}));
var SurveyWidgetType;
(function (SurveyWidgetType) {
    SurveyWidgetType["Button"] = "button";
    SurveyWidgetType["Tab"] = "tab";
    SurveyWidgetType["Selector"] = "selector";
})(SurveyWidgetType || (exports.SurveyWidgetType = SurveyWidgetType = {}));
var SurveyPosition;
(function (SurveyPosition) {
    SurveyPosition["TopLeft"] = "top_left";
    SurveyPosition["TopRight"] = "top_right";
    SurveyPosition["TopCenter"] = "top_center";
    SurveyPosition["MiddleLeft"] = "middle_left";
    SurveyPosition["MiddleRight"] = "middle_right";
    SurveyPosition["MiddleCenter"] = "middle_center";
    SurveyPosition["Left"] = "left";
    SurveyPosition["Center"] = "center";
    SurveyPosition["Right"] = "right";
    SurveyPosition["NextToTrigger"] = "next_to_trigger";
})(SurveyPosition || (exports.SurveyPosition = SurveyPosition = {}));
var SurveyTabPosition;
(function (SurveyTabPosition) {
    SurveyTabPosition["Top"] = "top";
    SurveyTabPosition["Left"] = "left";
    SurveyTabPosition["Right"] = "right";
    SurveyTabPosition["Bottom"] = "bottom";
})(SurveyTabPosition || (exports.SurveyTabPosition = SurveyTabPosition = {}));
var SurveyType;
(function (SurveyType) {
    SurveyType["Popover"] = "popover";
    SurveyType["API"] = "api";
    SurveyType["Widget"] = "widget";
    SurveyType["ExternalSurvey"] = "external_survey";
})(SurveyType || (exports.SurveyType = SurveyType = {}));
var SurveyQuestionType;
(function (SurveyQuestionType) {
    SurveyQuestionType["Open"] = "open";
    SurveyQuestionType["MultipleChoice"] = "multiple_choice";
    SurveyQuestionType["SingleChoice"] = "single_choice";
    SurveyQuestionType["Rating"] = "rating";
    SurveyQuestionType["Link"] = "link";
})(SurveyQuestionType || (exports.SurveyQuestionType = SurveyQuestionType = {}));
var SurveyQuestionBranchingType;
(function (SurveyQuestionBranchingType) {
    SurveyQuestionBranchingType["NextQuestion"] = "next_question";
    SurveyQuestionBranchingType["End"] = "end";
    SurveyQuestionBranchingType["ResponseBased"] = "response_based";
    SurveyQuestionBranchingType["SpecificQuestion"] = "specific_question";
})(SurveyQuestionBranchingType || (exports.SurveyQuestionBranchingType = SurveyQuestionBranchingType = {}));
var SurveySchedule;
(function (SurveySchedule) {
    SurveySchedule["Once"] = "once";
    SurveySchedule["Recurring"] = "recurring";
    SurveySchedule["Always"] = "always";
})(SurveySchedule || (exports.SurveySchedule = SurveySchedule = {}));
var SurveyEventName;
(function (SurveyEventName) {
    SurveyEventName["SHOWN"] = "survey shown";
    SurveyEventName["DISMISSED"] = "survey dismissed";
    SurveyEventName["SENT"] = "survey sent";
    SurveyEventName["ABANDONED"] = "survey abandoned";
})(SurveyEventName || (exports.SurveyEventName = SurveyEventName = {}));
var SurveyEventProperties;
(function (SurveyEventProperties) {
    SurveyEventProperties["SURVEY_ID"] = "$survey_id";
    SurveyEventProperties["SURVEY_NAME"] = "$survey_name";
    SurveyEventProperties["SURVEY_RESPONSE"] = "$survey_response";
    SurveyEventProperties["SURVEY_ITERATION"] = "$survey_iteration";
    SurveyEventProperties["SURVEY_ITERATION_START_DATE"] = "$survey_iteration_start_date";
    SurveyEventProperties["SURVEY_PARTIALLY_COMPLETED"] = "$survey_partially_completed";
    SurveyEventProperties["SURVEY_SUBMISSION_ID"] = "$survey_submission_id";
    SurveyEventProperties["SURVEY_QUESTIONS"] = "$survey_questions";
    SurveyEventProperties["SURVEY_COMPLETED"] = "$survey_completed";
    SurveyEventProperties["PRODUCT_TOUR_ID"] = "$product_tour_id";
    SurveyEventProperties["SURVEY_LAST_SEEN_DATE"] = "$survey_last_seen_date";
})(SurveyEventProperties || (exports.SurveyEventProperties = SurveyEventProperties = {}));
var DisplaySurveyType;
(function (DisplaySurveyType) {
    DisplaySurveyType["Popover"] = "popover";
    DisplaySurveyType["Inline"] = "inline";
})(DisplaySurveyType || (exports.DisplaySurveyType = DisplaySurveyType = {}));
//# sourceMappingURL=posthog-surveys-types.js.map