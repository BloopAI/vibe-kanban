"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sr = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Serbian (Cyrillic) locale extended with DayPicker-specific translations. */
exports.sr = {
    ...locale_1.sr,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Данас, ${label}`;
            if (modifiers.selected)
                label = `${label}, изабрано`;
            return label;
        },
        labelMonthDropdown: "Изаберите месец",
        labelNext: "Идите на следећи месец",
        labelPrevious: "Идите на претходни месец",
        labelWeekNumber: (weekNumber) => `Недеља ${weekNumber}`,
        labelYearDropdown: "Изаберите годину",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Данас, ${label}`;
            }
            return label;
        },
        labelNav: "Навигациона трака",
        labelWeekNumberHeader: "Број недеље",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
