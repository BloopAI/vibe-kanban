"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uzCyrl = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Uzbek (Cyrillic) locale extended with DayPicker-specific translations. */
exports.uzCyrl = {
    ...locale_1.uzCyrl,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Бугун, ${label}`;
            if (modifiers.selected)
                label = `${label}, танланган`;
            return label;
        },
        labelMonthDropdown: "Ойни танланг",
        labelNext: "Кейинги ойга ўтинг",
        labelPrevious: "Олдинги ойга ўтинг",
        labelWeekNumber: (weekNumber) => `Ҳафта ${weekNumber}`,
        labelYearDropdown: "Йилни танланг",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Бугун, ${label}`;
            }
            return label;
        },
        labelNav: "Навигация панели",
        labelWeekNumberHeader: "Ҳафта рақами",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
