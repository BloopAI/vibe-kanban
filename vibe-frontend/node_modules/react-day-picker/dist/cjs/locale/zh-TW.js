"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.zhTW = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/**
 * Chinese (Traditional, Taiwan) locale extended with DayPicker-specific
 * translations.
 */
exports.zhTW = {
    ...locale_1.zhTW,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `今天，${label}`;
            if (modifiers.selected)
                label = `${label}，已選取`;
            return label;
        },
        labelMonthDropdown: "選擇月份",
        labelNext: "前往下個月",
        labelPrevious: "前往上個月",
        labelWeekNumber: (weekNumber) => `第 ${weekNumber} 週`,
        labelYearDropdown: "選擇年份",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `今天，${label}`;
            }
            return label;
        },
        labelNav: "導覽列",
        labelWeekNumberHeader: "週數",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
