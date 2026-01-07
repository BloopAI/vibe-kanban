"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.arTN = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Arabic (Tunisia) locale extended with DayPicker-specific translations. */
exports.arTN = {
    ...locale_1.arTN,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `اليوم، ${label}`;
            if (modifiers.selected)
                label = `${label}، محدد`;
            return label;
        },
        labelMonthDropdown: "اختر الشهر",
        labelNext: "اذهب إلى الشهر التالي",
        labelPrevious: "اذهب إلى الشهر السابق",
        labelWeekNumber: (weekNumber) => `الأسبوع ${weekNumber}`,
        labelYearDropdown: "اختر السنة",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `اليوم، ${label}`;
            }
            return label;
        },
        labelNav: "شريط التنقل",
        labelWeekNumberHeader: "رقم الأسبوع",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
