"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sk = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Slovak locale extended with DayPicker-specific translations. */
exports.sk = {
    ...locale_1.sk,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Dnes, ${label}`;
            if (modifiers.selected)
                label = `${label}, vybraté`;
            return label;
        },
        labelMonthDropdown: "Vyberte mesiac",
        labelNext: "Prejsť na ďalší mesiac",
        labelPrevious: "Prejsť na predchádzajúci mesiac",
        labelWeekNumber: (weekNumber) => `Týždeň ${weekNumber}`,
        labelYearDropdown: "Vyberte rok",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Dnes, ${label}`;
            }
            return label;
        },
        labelNav: "Navigačný panel",
        labelWeekNumberHeader: "Číslo týždňa",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
