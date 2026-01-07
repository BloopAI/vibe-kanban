import { ug as dateFnsUg } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Uyghur locale extended with DayPicker-specific translations. */
export const ug = {
    ...dateFnsUg,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `بۈگۈن، ${label}`;
            if (modifiers.selected)
                label = `${label}، تاللانغان`;
            return label;
        },
        labelMonthDropdown: "ئاي تاللاڭ",
        labelNext: "كېيىنكى ئايغا يۆتكەڭ",
        labelPrevious: "ئالدىنقى ئايغا يۆتكەڭ",
        labelWeekNumber: (weekNumber) => `ھەپتە ${weekNumber}`,
        labelYearDropdown: "يىل تاللاڭ",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `بۈگۈن، ${label}`;
            }
            return label;
        },
        labelNav: "يولباشچى بالداق",
        labelWeekNumberHeader: "ھەپتە نومۇرى",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
