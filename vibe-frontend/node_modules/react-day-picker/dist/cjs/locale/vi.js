"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.vi = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Vietnamese locale extended with DayPicker-specific translations. */
exports.vi = {
    ...locale_1.vi,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Hôm nay, ${label}`;
            if (modifiers.selected)
                label = `${label}, đã chọn`;
            return label;
        },
        labelMonthDropdown: "Chọn tháng",
        labelNext: "Đến tháng tiếp theo",
        labelPrevious: "Đến tháng trước",
        labelWeekNumber: (weekNumber) => `Tuần ${weekNumber}`,
        labelYearDropdown: "Chọn năm",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Hôm nay, ${label}`;
            }
            return label;
        },
        labelNav: "Thanh điều hướng",
        labelWeekNumberHeader: "Số tuần",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
