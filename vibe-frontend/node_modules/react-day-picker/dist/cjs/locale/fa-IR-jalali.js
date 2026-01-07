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
Object.defineProperty(exports, "__esModule", { value: true });
exports.faIRJalali = void 0;
const dateFnsJalali = __importStar(require("date-fns-jalali"));
const locale_1 = require("date-fns-jalali/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/**
 * Persian (Iran) locale for the Jalali (Persian) calendar, extended with
 * DayPicker-specific translations.
 */
exports.faIRJalali = {
    ...locale_1.faIR,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options, dateFnsJalali);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `امروز، ${label}`;
            if (modifiers.selected)
                label = `${label}، انتخاب شده`;
            return label;
        },
        labelMonthDropdown: "ماه را انتخاب کنید",
        labelNext: "رفتن به ماه بعد",
        labelPrevious: "رفتن به ماه قبل",
        labelWeekNumber: (weekNumber) => `هفته ${weekNumber}`,
        labelYearDropdown: "سال را انتخاب کنید",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options, dateFnsJalali)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options, dateFnsJalali);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `امروز، ${label}`;
            }
            return label;
        },
        labelNav: "نوار ناوبری",
        labelWeekNumberHeader: "شماره هفته",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options, dateFnsJalali)).format(date, "cccc"),
    },
};
