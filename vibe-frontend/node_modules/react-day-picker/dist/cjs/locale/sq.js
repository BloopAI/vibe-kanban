"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sq = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Albanian locale extended with DayPicker-specific translations. */
exports.sq = {
    ...locale_1.sq,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Sot, ${label}`;
            if (modifiers.selected)
                label = `${label}, zgjedhur`;
            return label;
        },
        labelMonthDropdown: "Zgjidhni muajin",
        labelNext: "Shko te muaji tjetër",
        labelPrevious: "Shko te muaji i mëparshëm",
        labelWeekNumber: (weekNumber) => `Java ${weekNumber}`,
        labelYearDropdown: "Zgjidhni vitin",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Sot, ${label}`;
            }
            return label;
        },
        labelNav: "Shiriti i navigimit",
        labelWeekNumberHeader: "Numri i javës",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
