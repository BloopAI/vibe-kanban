"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mt = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Maltese locale extended with DayPicker-specific translations. */
exports.mt = {
    ...locale_1.mt,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Illum, ${label}`;
            if (modifiers.selected)
                label = `${label}, magħżul`;
            return label;
        },
        labelMonthDropdown: "Agħżel ix-xahar",
        labelNext: "Mur għax-xahar li jmiss",
        labelPrevious: "Mur għax-xahar ta' qabel",
        labelWeekNumber: (weekNumber) => `Ġimgħa ${weekNumber}`,
        labelYearDropdown: "Agħżel is-sena",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Illum, ${label}`;
            }
            return label;
        },
        labelNav: "Bar tan-navigazzjoni",
        labelWeekNumberHeader: "Numru tal-ġimgħa",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
