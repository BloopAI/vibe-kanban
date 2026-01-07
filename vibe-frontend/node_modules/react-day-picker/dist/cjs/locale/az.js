"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.az = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Azerbaijani locale extended with DayPicker-specific translations. */
exports.az = {
    ...locale_1.az,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Bu gün, ${label}`;
            if (modifiers.selected)
                label = `${label}, seçilmiş`;
            return label;
        },
        labelMonthDropdown: "Ayı seçin",
        labelNext: "Növbəti aya keç",
        labelPrevious: "Əvvəlki aya keç",
        labelWeekNumber: (weekNumber) => `Həftə ${weekNumber}`,
        labelYearDropdown: "İli seçin",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Bu gün, ${label}`;
            }
            return label;
        },
        labelNav: "Naviqasiya paneli",
        labelWeekNumberHeader: "Həftə nömrəsi",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
