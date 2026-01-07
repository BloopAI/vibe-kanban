"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.gu = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Gujarati locale extended with DayPicker-specific translations. */
exports.gu = {
    ...locale_1.gu,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `આજે, ${label}`;
            if (modifiers.selected)
                label = `${label}, પસંદ કરાયેલ`;
            return label;
        },
        labelMonthDropdown: "મહિનો પસંદ કરો",
        labelNext: "આગલા મહિને જાઓ",
        labelPrevious: "પાછલા મહિને જાઓ",
        labelWeekNumber: (weekNumber) => `અઠવાડિયું ${weekNumber}`,
        labelYearDropdown: "વર્ષ પસંદ કરો",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `આજે, ${label}`;
            }
            return label;
        },
        labelNav: "નેવિગેશન બાર",
        labelWeekNumberHeader: "અઠવાડિયાનો નંબર",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
