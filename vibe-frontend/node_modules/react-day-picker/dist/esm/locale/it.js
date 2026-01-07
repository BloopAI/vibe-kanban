import { it as dateFnsIt } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Italian locale extended with DayPicker-specific translations. */
export const it = {
    ...dateFnsIt,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Oggi, ${label}`;
            if (modifiers.selected)
                label = `${label}, selezionato`;
            return label;
        },
        labelMonthDropdown: "Scegli il mese",
        labelNext: "Vai al mese successivo",
        labelPrevious: "Vai al mese precedente",
        labelWeekNumber: (weekNumber) => `Settimana ${weekNumber}`,
        labelYearDropdown: "Scegli l’anno",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Oggi, ${label}`;
            }
            return label;
        },
        labelNav: "Barra di navigazione",
        labelWeekNumberHeader: "Numero settimana",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
