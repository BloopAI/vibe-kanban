"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ka = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Georgian locale extended with DayPicker-specific translations. */
exports.ka = {
    ...locale_1.ka,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `დღეს, ${label}`;
            if (modifiers.selected)
                label = `${label}, მონიშნული`;
            return label;
        },
        labelMonthDropdown: "აირჩიეთ თვე",
        labelNext: "გადასვლა შემდეგ თვეზე",
        labelPrevious: "გადასვლა წინა თვეზე",
        labelWeekNumber: (weekNumber) => `კვირა ${weekNumber}`,
        labelYearDropdown: "აირჩიეთ წელი",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `დღეს, ${label}`;
            }
            return label;
        },
        labelNav: "ნავიგაციის ზოლი",
        labelWeekNumberHeader: "კვირის ნომერი",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
