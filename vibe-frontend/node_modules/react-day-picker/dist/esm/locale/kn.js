import { kn as dateFnsKn } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Kannada locale extended with DayPicker-specific translations. */
export const kn = {
    ...dateFnsKn,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `ಇಂದು, ${label}`;
            if (modifiers.selected)
                label = `${label}, ಆಯ್ಕೆ ಮಾಡಿದ`;
            return label;
        },
        labelMonthDropdown: "ತಿಂಗಳ ಆಯ್ಕೆ",
        labelNext: "ಮುಂದಿನ ತಿಂಗಳಿಗೆ ಹೋಗಿ",
        labelPrevious: "ಹಿಂದಿನ ತಿಂಗಳಿಗೆ ಹೋಗಿ",
        labelWeekNumber: (weekNumber) => `ವಾರ ${weekNumber}`,
        labelYearDropdown: "ವರ್ಷ ಆಯ್ಕೆಮಾಡಿ",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `ಇಂದು, ${label}`;
            }
            return label;
        },
        labelNav: "ನವಿಗೇಶನ್ ಪಟ್ಟೆ",
        labelWeekNumberHeader: "ವಾರ ಸಂಖ್ಯೆ",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
