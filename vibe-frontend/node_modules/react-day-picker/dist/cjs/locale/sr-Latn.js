"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.srLatn = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Serbian (Latin) locale extended with DayPicker-specific translations. */
exports.srLatn = {
    ...locale_1.srLatn,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Danas, ${label}`;
            if (modifiers.selected)
                label = `${label}, izabrano`;
            return label;
        },
        labelMonthDropdown: "Izaberite mesec",
        labelNext: "Idite na sledeći mesec",
        labelPrevious: "Idite na prethodni mesec",
        labelWeekNumber: (weekNumber) => `Nedelja ${weekNumber}`,
        labelYearDropdown: "Izaberite godinu",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Danas, ${label}`;
            }
            return label;
        },
        labelNav: "Navigaciona traka",
        labelWeekNumberHeader: "Broj nedelje",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
