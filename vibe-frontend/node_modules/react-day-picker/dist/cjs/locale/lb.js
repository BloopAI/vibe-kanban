"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lb = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Luxembourgish locale extended with DayPicker-specific translations. */
exports.lb = {
    ...locale_1.lb,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Haut, ${label}`;
            if (modifiers.selected)
                label = `${label}, ausgewielt`;
            return label;
        },
        labelMonthDropdown: "Mount auswielen",
        labelNext: "Op de nächste Mount",
        labelPrevious: "Op de virdrun Mount",
        labelWeekNumber: (weekNumber) => `Woch ${weekNumber}`,
        labelYearDropdown: "Joer auswielen",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Haut, ${label}`;
            }
            return label;
        },
        labelNav: "Navigatiounsbar",
        labelWeekNumberHeader: "Wochennummer",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
