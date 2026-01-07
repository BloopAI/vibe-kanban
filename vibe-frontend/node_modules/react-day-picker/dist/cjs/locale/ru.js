"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ru = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Russian locale extended with DayPicker-specific translations. */
exports.ru = {
    ...locale_1.ru,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Сегодня, ${label}`;
            if (modifiers.selected)
                label = `${label}, выбрано`;
            return label;
        },
        labelMonthDropdown: "Выберите месяц",
        labelNext: "Перейти к следующему месяцу",
        labelPrevious: "Перейти к предыдущему месяцу",
        labelWeekNumber: (weekNumber) => `Неделя ${weekNumber}`,
        labelYearDropdown: "Выберите год",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Сегодня, ${label}`;
            }
            return label;
        },
        labelNav: "Панель навигации",
        labelWeekNumberHeader: "Номер недели",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
