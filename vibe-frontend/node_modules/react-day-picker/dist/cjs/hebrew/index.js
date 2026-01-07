"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.he = exports.enUS = exports.getDateLib = void 0;
exports.DayPicker = DayPicker;
const react_1 = __importDefault(require("react"));
const index_js_1 = require("../index.js");
const he_js_1 = require("../locale/he.js");
const hebrewDateLib = __importStar(require("./lib/index.js"));
/**
 * Render the Hebrew (lunisolar) calendar.
 *
 * Months follow the Hebrew lunisolar cycle with leap years containing Adar I
 * and Adar II. Weeks remain Sunday–Saturday.
 *
 * Defaults:
 *
 * - `locale`: `he`
 * - `dir`: `rtl`
 * - `numerals`: `latn`
 */
function DayPicker(props) {
    const dateLib = (0, exports.getDateLib)({
        locale: props.locale,
        weekStartsOn: props.broadcastCalendar ? 1 : props.weekStartsOn,
        firstWeekContainsDate: props.firstWeekContainsDate,
        useAdditionalWeekYearTokens: props.useAdditionalWeekYearTokens,
        useAdditionalDayOfYearTokens: props.useAdditionalDayOfYearTokens,
        timeZone: props.timeZone,
    });
    return (react_1.default.createElement(index_js_1.DayPicker, { ...props, locale: props.locale ?? he_js_1.he, numerals: props.numerals ?? "latn", dir: props.dir ?? "rtl", dateLib: dateLib }));
}
/** Returns the date library used in the Hebrew calendar. */
const getDateLib = (options) => {
    return new index_js_1.DateLib(options, hebrewDateLib);
};
exports.getDateLib = getDateLib;
var en_US_js_1 = require("../locale/en-US.js");
Object.defineProperty(exports, "enUS", { enumerable: true, get: function () { return en_US_js_1.enUS; } });
var he_js_2 = require("../locale/he.js");
Object.defineProperty(exports, "he", { enumerable: true, get: function () { return he_js_2.he; } });
