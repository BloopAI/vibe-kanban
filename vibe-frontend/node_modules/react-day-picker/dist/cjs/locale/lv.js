"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lv = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Latvian locale extended with DayPicker-specific translations. */
exports.lv = {
    ...locale_1.lv,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Šodien, ${label}`;
            if (modifiers.selected)
                label = `${label}, izvēlēts`;
            return label;
        },
        labelMonthDropdown: "Izvēlieties mēnesi",
        labelNext: "Uz nākamo mēnesi",
        labelPrevious: "Uz iepriekšējo mēnesi",
        labelWeekNumber: (weekNumber) => `Nedēļa ${weekNumber}`,
        labelYearDropdown: "Izvēlieties gadu",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Šodien, ${label}`;
            }
            return label;
        },
        labelNav: "Navigācijas josla",
        labelWeekNumberHeader: "Nedēļas numurs",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
