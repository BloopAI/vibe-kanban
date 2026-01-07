"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ja = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Japanese locale extended with DayPicker-specific translations. */
exports.ja = {
    ...locale_1.ja,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `今日、${label}`;
            if (modifiers.selected)
                label = `${label}、選択済み`;
            return label;
        },
        labelMonthDropdown: "月を選択",
        labelNext: "次の月へ",
        labelPrevious: "前の月へ",
        labelWeekNumber: (weekNumber) => `第${weekNumber}週`,
        labelYearDropdown: "年を選択",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `今日、${label}`;
            }
            return label;
        },
        labelNav: "ナビゲーションバー",
        labelWeekNumberHeader: "週番号",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
