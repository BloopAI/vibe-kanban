import { ka as dateFnsKa } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Georgian locale extended with DayPicker-specific translations. */
export const ka = {
    ...dateFnsKa,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `დღეს, ${label}`;
            if (modifiers.selected)
                label = `${label}, მონიშნული`;
            return label;
        },
        labelMonthDropdown: "აირჩიეთ თვე",
        labelNext: "გადასვლა შემდეგ თვეზე",
        labelPrevious: "გადასვლა წინა თვეზე",
        labelWeekNumber: (weekNumber) => `კვირა ${weekNumber}`,
        labelYearDropdown: "აირჩიეთ წელი",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `დღეს, ${label}`;
            }
            return label;
        },
        labelNav: "ნავიგაციის ზოლი",
        labelWeekNumberHeader: "კვირის ნომერი",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
