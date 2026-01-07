"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bn = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Bengali locale extended with DayPicker-specific translations. */
exports.bn = {
    ...locale_1.bn,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `আজ, ${label}`;
            if (modifiers.selected)
                label = `${label}, নির্বাচিত`;
            return label;
        },
        labelMonthDropdown: "মাস নির্বাচন করুন",
        labelNext: "পরবর্তী মাসে যান",
        labelPrevious: "পূর্ববর্তী মাসে যান",
        labelWeekNumber: (weekNumber) => `সপ্তাহ ${weekNumber}`,
        labelYearDropdown: "বছর নির্বাচন করুন",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `আজ, ${label}`;
            }
            return label;
        },
        labelNav: "নেভিগেশন বার",
        labelWeekNumberHeader: "সপ্তাহ নম্বর",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
