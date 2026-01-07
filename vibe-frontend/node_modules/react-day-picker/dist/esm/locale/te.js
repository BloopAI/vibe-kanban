import { te as dateFnsTe } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Telugu locale extended with DayPicker-specific translations. */
export const te = {
    ...dateFnsTe,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `ఈ రోజు, ${label}`;
            if (modifiers.selected)
                label = `${label}, ఎంచుకోబడింది`;
            return label;
        },
        labelMonthDropdown: "నెలను ఎంచుకోండి",
        labelNext: "తదుపరి నెలకు వెళ్లండి",
        labelPrevious: "మునుపటి నెలకు వెళ్లండి",
        labelWeekNumber: (weekNumber) => `వారం ${weekNumber}`,
        labelYearDropdown: "సంవత్సరాన్ని ఎంచుకోండి",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `ఈ రోజు, ${label}`;
            }
            return label;
        },
        labelNav: "నావిగేషన్ పట్టీ",
        labelWeekNumberHeader: "వారం సంఖ్య",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
