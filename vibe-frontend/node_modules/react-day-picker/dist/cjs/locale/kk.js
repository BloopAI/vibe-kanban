"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.kk = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Kazakh locale extended with DayPicker-specific translations. */
exports.kk = {
    ...locale_1.kk,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Бүгін, ${label}`;
            if (modifiers.selected)
                label = `${label}, таңдалған`;
            return label;
        },
        labelMonthDropdown: "Айды таңдаңыз",
        labelNext: "Келесі айға өту",
        labelPrevious: "Алдыңғы айға өту",
        labelWeekNumber: (weekNumber) => `Апта ${weekNumber}`,
        labelYearDropdown: "Жылды таңдаңыз",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Бүгін, ${label}`;
            }
            return label;
        },
        labelNav: "Навигация жолағы",
        labelWeekNumberHeader: "Апта нөмірі",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
