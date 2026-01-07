"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ug = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Uyghur locale extended with DayPicker-specific translations. */
exports.ug = {
    ...locale_1.ug,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `بۈگۈن، ${label}`;
            if (modifiers.selected)
                label = `${label}، تاللانغان`;
            return label;
        },
        labelMonthDropdown: "ئاي تاللاڭ",
        labelNext: "كېيىنكى ئايغا يۆتكەڭ",
        labelPrevious: "ئالدىنقى ئايغا يۆتكەڭ",
        labelWeekNumber: (weekNumber) => `ھەپتە ${weekNumber}`,
        labelYearDropdown: "يىل تاللاڭ",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `بۈگۈن، ${label}`;
            }
            return label;
        },
        labelNav: "يولباشچى بالداق",
        labelWeekNumberHeader: "ھەپتە نومۇرى",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
