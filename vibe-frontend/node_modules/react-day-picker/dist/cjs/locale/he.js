"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.he = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Hebrew locale extended with DayPicker-specific translations. */
exports.he = {
    ...locale_1.he,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `היום, ${label}`;
            if (modifiers.selected)
                label = `${label}, נבחר`;
            return label;
        },
        labelMonthDropdown: "בחר את החודש",
        labelNext: "עבור לחודש הבא",
        labelPrevious: "עבור לחודש הקודם",
        labelWeekNumber: (weekNumber) => `שבוע ${weekNumber}`,
        labelYearDropdown: "בחר את השנה",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `היום, ${label}`;
            }
            return label;
        },
        labelNav: "סרגל ניווט",
        labelWeekNumberHeader: "מספר שבוע",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
