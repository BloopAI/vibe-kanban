"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.se = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Northern Sami locale extended with DayPicker-specific translations. */
exports.se = {
    ...locale_1.se,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Ođđaid, ${label}`;
            if (modifiers.selected)
                label = `${label}, válljejuvvon`;
            return label;
        },
        labelMonthDropdown: "Vállje mánnu",
        labelNext: "Mana boahtte mánu",
        labelPrevious: "Mana ovddit mánu",
        labelWeekNumber: (weekNumber) => `Vahkku ${weekNumber}`,
        labelYearDropdown: "Vállje jahki",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Ođđaid, ${label}`;
            }
            return label;
        },
        labelNav: "Navigasuvnnabár",
        labelWeekNumberHeader: "Vahkku lohku",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
