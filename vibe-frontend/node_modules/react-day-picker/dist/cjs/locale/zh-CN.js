"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.zhCN = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Chinese (Simplified) locale extended with DayPicker-specific translations. */
exports.zhCN = {
    ...locale_1.zhCN,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `今天，${label}`;
            if (modifiers.selected)
                label = `${label}，已选择`;
            return label;
        },
        labelMonthDropdown: "选择月份",
        labelNext: "前往下个月",
        labelPrevious: "前往上个月",
        labelWeekNumber: (weekNumber) => `第 ${weekNumber} 周`,
        labelYearDropdown: "选择年份",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `今天，${label}`;
            }
            return label;
        },
        labelNav: "导航栏",
        labelWeekNumberHeader: "周数",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
