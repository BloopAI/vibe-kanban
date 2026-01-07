import { el as dateFnsEl } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Greek locale extended with DayPicker-specific translations. */
export const el = {
    ...dateFnsEl,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Σήμερα, ${label}`;
            if (modifiers.selected)
                label = `${label}, επιλεγμένο`;
            return label;
        },
        labelMonthDropdown: "Επιλέξτε μήνα",
        labelNext: "Μετάβαση στον επόμενο μήνα",
        labelPrevious: "Μετάβαση στον προηγούμενο μήνα",
        labelWeekNumber: (weekNumber) => `Εβδομάδα ${weekNumber}`,
        labelYearDropdown: "Επιλέξτε έτος",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Σήμερα, ${label}`;
            }
            return label;
        },
        labelNav: "Γραμμή πλοήγησης",
        labelWeekNumberHeader: "Αριθμός εβδομάδας",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
