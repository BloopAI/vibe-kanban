"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mn = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Mongolian locale extended with DayPicker-specific translations. */
exports.mn = {
    ...locale_1.mn,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Өнөөдөр, ${label}`;
            if (modifiers.selected)
                label = `${label}, сонгогдсон`;
            return label;
        },
        labelMonthDropdown: "Сараа сонгоно уу",
        labelNext: "Дараагийн сар руу очих",
        labelPrevious: "Өмнөх сар руу очих",
        labelWeekNumber: (weekNumber) => `Долоо хоног ${weekNumber}`,
        labelYearDropdown: "Жилээ сонгоно уу",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Өнөөдөр, ${label}`;
            }
            return label;
        },
        labelNav: "Навигацийн самбар",
        labelWeekNumberHeader: "Долоо хонгийн дугаар",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
