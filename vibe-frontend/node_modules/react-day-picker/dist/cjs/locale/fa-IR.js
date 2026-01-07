"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.faIR = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Persian (Iran) locale extended with DayPicker-specific translations. */
exports.faIR = {
    ...locale_1.faIR,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
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
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `امروز، ${label}`;
            }
            return label;
        },
        labelNav: "نوار ناوبری",
        labelWeekNumberHeader: "شماره هفته",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
