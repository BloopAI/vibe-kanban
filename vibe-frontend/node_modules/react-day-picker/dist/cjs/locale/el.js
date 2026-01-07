"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.el = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Greek locale extended with DayPicker-specific translations. */
exports.el = {
    ...locale_1.el,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Σήμερα, ${label}`;
            if (modifiers.selected)
                label = `${label}, επιλεγμένο`;
            return label;
        },
        labelMonthDropdown: "Επιλέξτε μήνα",
        labelNext: "Μετάβαση στον επόμενο μήνα",
        labelPrevious: "Μετάβαση στον προηγούμενο μήνα",
        labelWeekNumber: (weekNumber) => `Εβδομάδα ${weekNumber}`,
        labelYearDropdown: "Επιλέξτε έτος",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Σήμερα, ${label}`;
            }
            return label;
        },
        labelNav: "Γραμμή πλοήγησης",
        labelWeekNumberHeader: "Αριθμός εβδομάδας",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
