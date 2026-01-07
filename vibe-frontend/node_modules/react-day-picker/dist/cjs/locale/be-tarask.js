"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.beTarask = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/**
 * Belarusian (Taraskievica) locale extended with DayPicker-specific
 * translations.
 */
exports.beTarask = {
    ...locale_1.beTarask,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Сёньня, ${label}`;
            if (modifiers.selected)
                label = `${label}, абрана`;
            return label;
        },
        labelMonthDropdown: "Выберыце месяц",
        labelNext: "Перайсьці да наступнага месяца",
        labelPrevious: "Перайсьці да папярэдняга месяца",
        labelWeekNumber: (weekNumber) => `Тыдзень ${weekNumber}`,
        labelYearDropdown: "Выберыце год",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Сёньня, ${label}`;
            }
            return label;
        },
        labelNav: "Панэль навігацыі",
        labelWeekNumberHeader: "Нумар тыдня",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
