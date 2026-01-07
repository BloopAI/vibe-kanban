"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uz = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Uzbek (Latin) locale extended with DayPicker-specific translations. */
exports.uz = {
    ...locale_1.uz,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Bugun, ${label}`;
            if (modifiers.selected)
                label = `${label}, tanlangan`;
            return label;
        },
        labelMonthDropdown: "Oyni tanlang",
        labelNext: "Keyingi oyga o'ting",
        labelPrevious: "Oldingi oyga o'ting",
        labelWeekNumber: (weekNumber) => `Hafta ${weekNumber}`,
        labelYearDropdown: "Yilni tanlang",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Bugun, ${label}`;
            }
            return label;
        },
        labelNav: "Navigatsiya paneli",
        labelWeekNumberHeader: "Hafta raqami",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
