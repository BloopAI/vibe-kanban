"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.da = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Danish locale extended with DayPicker-specific translations. */
exports.da = {
    ...locale_1.da,
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
        labelMonthDropdown: "Vælg måned",
        labelNext: "Gå til næste måned",
        labelPrevious: "Gå til forrige måned",
        labelWeekNumber: (weekNumber) => `Uge ${weekNumber}`,
        labelYearDropdown: "Vælg år",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `I dag, ${label}`;
            }
            return label;
        },
        labelNav: "Navigationslinje",
        labelWeekNumberHeader: "Ugenummer",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
