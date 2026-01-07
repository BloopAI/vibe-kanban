"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hr = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Croatian locale extended with DayPicker-specific translations. */
exports.hr = {
    ...locale_1.hr,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Danas, ${label}`;
            if (modifiers.selected)
                label = `${label}, odabrano`;
            return label;
        },
        labelMonthDropdown: "Odaberite mjesec",
        labelNext: "Prijeđi na sljedeći mjesec",
        labelPrevious: "Prijeđi na prethodni mjesec",
        labelWeekNumber: (weekNumber) => `Tjedan ${weekNumber}`,
        labelYearDropdown: "Odaberite godinu",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Danas, ${label}`;
            }
            return label;
        },
        labelNav: "Navigacijska traka",
        labelWeekNumberHeader: "Broj tjedna",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
