"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.de = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** German locale extended with DayPicker-specific translations. */
exports.de = {
    ...locale_1.de,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Heute, ${label}`;
            if (modifiers.selected)
                label = `${label}, ausgewählt`;
            return label;
        },
        labelMonthDropdown: "Monat auswählen",
        labelNext: "Zum nächsten Monat",
        labelPrevious: "Zum vorherigen Monat",
        labelWeekNumber: (weekNumber) => `Woche ${weekNumber}`,
        labelYearDropdown: "Jahr auswählen",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Heute, ${label}`;
            }
            return label;
        },
        labelNav: "Navigationsleiste",
        labelWeekNumberHeader: "Wochennummer",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
