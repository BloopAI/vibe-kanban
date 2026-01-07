"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nb = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Norwegian Bokmål locale extended with DayPicker-specific translations. */
exports.nb = {
    ...locale_1.nb,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `I dag, ${label}`;
            if (modifiers.selected)
                label = `${label}, valgt`;
            return label;
        },
        labelMonthDropdown: "Velg måned",
        labelNext: "Gå til neste måned",
        labelPrevious: "Gå til forrige måned",
        labelWeekNumber: (weekNumber) => `Uke ${weekNumber}`,
        labelYearDropdown: "Velg år",
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
        labelWeekNumberHeader: "Ukenummer",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
