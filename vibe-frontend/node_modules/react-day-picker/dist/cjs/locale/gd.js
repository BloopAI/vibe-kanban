"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.gd = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Scottish Gaelic locale extended with DayPicker-specific translations. */
exports.gd = {
    ...locale_1.gd,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `An-diugh, ${label}`;
            if (modifiers.selected)
                label = `${label}, air a thaghadh`;
            return label;
        },
        labelMonthDropdown: "Tagh am mìos",
        labelNext: "Rach gu mìos an ath mhìos",
        labelPrevious: "Rach gu mìos roimhe",
        labelWeekNumber: (weekNumber) => `Seachdain ${weekNumber}`,
        labelYearDropdown: "Tagh am bliadhna",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `An-diugh, ${label}`;
            }
            return label;
        },
        labelNav: "Bàr seòlaidh",
        labelWeekNumberHeader: "Àireamh seachdain",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
