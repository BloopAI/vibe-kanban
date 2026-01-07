"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.frCH = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** French (Switzerland) locale extended with DayPicker-specific translations. */
exports.frCH = {
    ...locale_1.frCH,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Aujourd'hui, ${label}`;
            if (modifiers.selected)
                label = `${label}, sélectionné`;
            return label;
        },
        labelMonthDropdown: "Choisir le mois",
        labelNext: "Aller au mois suivant",
        labelPrevious: "Aller au mois précédent",
        labelWeekNumber: (weekNumber) => `Semaine ${weekNumber}`,
        labelYearDropdown: "Choisir l'année",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Aujourd'hui, ${label}`;
            }
            return label;
        },
        labelNav: "Barre de navigation",
        labelWeekNumberHeader: "Numéro de semaine",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
