"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.af = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Afrikaans locale extended with DayPicker-specific translations. */
exports.af = {
    ...locale_1.af,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Vandag, ${label}`;
            if (modifiers.selected)
                label = `${label}, gekies`;
            return label;
        },
        labelMonthDropdown: "Kies die maand",
        labelNext: "Gaan na volgende maand",
        labelPrevious: "Gaan na vorige maand",
        labelWeekNumber: (weekNumber) => `Week ${weekNumber}`,
        labelYearDropdown: "Kies die jaar",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Vandag, ${label}`;
            }
            return label;
        },
        labelNav: "Navigasiebalk",
        labelWeekNumberHeader: "Weeknommer",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
