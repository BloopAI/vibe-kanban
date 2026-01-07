"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uk = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Ukrainian locale extended with DayPicker-specific translations. */
exports.uk = {
    ...locale_1.uk,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Сьогодні, ${label}`;
            if (modifiers.selected)
                label = `${label}, вибрано`;
            return label;
        },
        labelMonthDropdown: "Виберіть місяць",
        labelNext: "Перейти до наступного місяця",
        labelPrevious: "Перейти до попереднього місяця",
        labelWeekNumber: (weekNumber) => `Тиждень ${weekNumber}`,
        labelYearDropdown: "Виберіть рік",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Сьогодні, ${label}`;
            }
            return label;
        },
        labelNav: "Панель навігації",
        labelWeekNumberHeader: "Номер тижня",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
