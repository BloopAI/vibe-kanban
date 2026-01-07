"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.be = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Belarusian locale extended with DayPicker-specific translations. */
exports.be = {
    ...locale_1.be,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Сёння, ${label}`;
            if (modifiers.selected)
                label = `${label}, абрана`;
            return label;
        },
        labelMonthDropdown: "Абярыце месяц",
        labelNext: "Перайсці да наступнага месяца",
        labelPrevious: "Перайсці да папярэдняга месяца",
        labelWeekNumber: (weekNumber) => `Тыдзень ${weekNumber}`,
        labelYearDropdown: "Абярыце год",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Сёння, ${label}`;
            }
            return label;
        },
        labelNav: "Панэль навігацыі",
        labelWeekNumberHeader: "Нумар тыдня",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
