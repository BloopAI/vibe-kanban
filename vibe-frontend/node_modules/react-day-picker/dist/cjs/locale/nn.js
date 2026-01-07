"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nn = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Norwegian Nynorsk locale extended with DayPicker-specific translations. */
exports.nn = {
    ...locale_1.nn,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `I dag, ${label}`;
            if (modifiers.selected)
                label = `${label}, vald`;
            return label;
        },
        labelMonthDropdown: "Vel månad",
        labelNext: "Gå til neste månad",
        labelPrevious: "Gå til førre månad",
        labelWeekNumber: (weekNumber) => `Veke ${weekNumber}`,
        labelYearDropdown: "Vel år",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `I dag, ${label}`;
            }
            return label;
        },
        labelNav: "Navigasjonslinje",
        labelWeekNumberHeader: "Vekenummer",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
