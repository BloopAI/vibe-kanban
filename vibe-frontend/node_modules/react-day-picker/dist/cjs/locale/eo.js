"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.eo = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Esperanto locale extended with DayPicker-specific translations. */
exports.eo = {
    ...locale_1.eo,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Hodiaŭ, ${label}`;
            if (modifiers.selected)
                label = `${label}, elektita`;
            return label;
        },
        labelMonthDropdown: "Elektu la monaton",
        labelNext: "Iru al la sekva monato",
        labelPrevious: "Iru al la antaŭa monato",
        labelWeekNumber: (weekNumber) => `Semajno ${weekNumber}`,
        labelYearDropdown: "Elektu la jaron",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Hodiaŭ, ${label}`;
            }
            return label;
        },
        labelNav: "Naviga breto",
        labelWeekNumberHeader: "Semajna numero",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
