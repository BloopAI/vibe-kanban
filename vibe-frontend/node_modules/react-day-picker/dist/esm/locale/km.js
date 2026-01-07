import { km as dateFnsKm } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Khmer locale extended with DayPicker-specific translations. */
export const km = {
    ...dateFnsKm,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `ថ្ងៃ​នេះ, ${label}`;
            if (modifiers.selected)
                label = `${label}, បាន​ជ្រើស`;
            return label;
        },
        labelMonthDropdown: "ជ្រើសខែ",
        labelNext: "ទៅខែក្រោយ",
        labelPrevious: "ទៅខែមុន",
        labelWeekNumber: (weekNumber) => `សប្ដាហ៍ ${weekNumber}`,
        labelYearDropdown: "ជ្រើសឆ្នាំ",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `ថ្ងៃ​នេះ, ${label}`;
            }
            return label;
        },
        labelNav: "របាររុករក",
        labelWeekNumberHeader: "លេខសប្ដាហ៍",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
