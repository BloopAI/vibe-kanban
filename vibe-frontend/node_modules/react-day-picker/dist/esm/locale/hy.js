import { hy as dateFnsHy } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Armenian locale extended with DayPicker-specific translations. */
export const hy = {
    ...dateFnsHy,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
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
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Այսօր, ${label}`;
            }
            return label;
        },
        labelNav: "Նավիգացիայի վահանակ",
        labelWeekNumberHeader: "Շաբաթվա համարը",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
