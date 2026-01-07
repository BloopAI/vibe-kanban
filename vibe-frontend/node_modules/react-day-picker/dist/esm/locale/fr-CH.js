import { frCH as dateFnsFrCH } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** French (Switzerland) locale extended with DayPicker-specific translations. */
export const frCH = {
    ...dateFnsFrCH,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
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
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Aujourd'hui, ${label}`;
            }
            return label;
        },
        labelNav: "Barre de navigation",
        labelWeekNumberHeader: "Numéro de semaine",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
