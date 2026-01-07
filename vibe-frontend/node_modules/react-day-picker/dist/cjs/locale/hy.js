"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hy = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Armenian locale extended with DayPicker-specific translations. */
exports.hy = {
    ...locale_1.hy,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Այսօր, ${label}`;
            if (modifiers.selected)
                label = `${label}, ընտրված`;
            return label;
        },
        labelMonthDropdown: "Ընտրեք ամիսը",
        labelNext: "Անցնել հաջորդ ամսին",
        labelPrevious: "Անցնել նախորդ ամսին",
        labelWeekNumber: (weekNumber) => `Շաբաթ ${weekNumber}`,
        labelYearDropdown: "Ընտրեք տարին",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Այսօր, ${label}`;
            }
            return label;
        },
        labelNav: "Նավիգացիայի վահանակ",
        labelWeekNumberHeader: "Շաբաթվա համարը",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
