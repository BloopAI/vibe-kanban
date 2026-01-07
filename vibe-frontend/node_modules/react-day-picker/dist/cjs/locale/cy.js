"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cy = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Welsh locale extended with DayPicker-specific translations. */
exports.cy = {
    ...locale_1.cy,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Heddiw, ${label}`;
            if (modifiers.selected)
                label = `${label}, wedi'i ddewis`;
            return label;
        },
        labelMonthDropdown: "Dewiswch y mis",
        labelNext: "Ewch i'r mis nesaf",
        labelPrevious: "Ewch i'r mis blaenorol",
        labelWeekNumber: (weekNumber) => `Wythnos ${weekNumber}`,
        labelYearDropdown: "Dewiswch y flwyddyn",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Heddiw, ${label}`;
            }
            return label;
        },
        labelNav: "Bar llywio",
        labelWeekNumberHeader: "Rhif yr wythnos",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
