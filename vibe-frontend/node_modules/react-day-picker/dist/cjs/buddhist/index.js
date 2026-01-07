"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDateLib = exports.enUS = exports.th = void 0;
exports.DayPicker = DayPicker;
const react_1 = __importDefault(require("react"));
const index_js_1 = require("../index.js");
const en_US_js_1 = require("../locale/en-US.js");
const th_js_1 = require("../locale/th.js");
const format_js_1 = require("./lib/format.js");
// Adapter to match DateLib's format signature without using `any`.
const buddhistFormat = (date, formatStr, options) => {
    return (0, format_js_1.format)(date, formatStr, options);
};
exports.th = th_js_1.th;
exports.enUS = en_US_js_1.enUS;
/**
 * Render the Buddhist (Thai) calendar.
 *
 * Months/weeks are Gregorian; displayed year is Buddhist Era (BE = CE + 543).
 * Thai digits are used by default.
 *
 * Defaults:
 *
 * - `locale`: `th`
 * - `dir`: `ltr`
 * - `numerals`: `thai`
 */
function DayPicker(props) {
    const dateLib = (0, exports.getDateLib)({
        locale: props.locale ?? exports.th,
        weekStartsOn: props.broadcastCalendar ? 1 : props.weekStartsOn,
        firstWeekContainsDate: props.firstWeekContainsDate,
        useAdditionalWeekYearTokens: props.useAdditionalWeekYearTokens,
        useAdditionalDayOfYearTokens: props.useAdditionalDayOfYearTokens,
        timeZone: props.timeZone,
    });
    return (react_1.default.createElement(index_js_1.DayPicker, { ...props, locale: props.locale ?? exports.th, numerals: props.numerals ?? "thai", dir: props.dir ?? "ltr", dateLib: dateLib }));
}
/** Returns the date library used in the Buddhist calendar. */
const getDateLib = (options) => {
    return new index_js_1.DateLib(options, {
        format: buddhistFormat,
    });
};
exports.getDateLib = getDateLib;
