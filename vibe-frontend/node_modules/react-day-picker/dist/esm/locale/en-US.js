import { format } from "date-fns";
import { enUS as dateFnsEnUS } from "date-fns/locale";
/** English (United States) locale extended with DayPicker-specific translations. */
export const enUS = {
    ...dateFnsEnUS,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            let formatDate;
            if (dateLib && typeof dateLib.format === "function") {
                formatDate = dateLib.format.bind(dateLib);
            }
            else {
                formatDate = (d, pattern) => format(d, pattern, { locale: dateFnsEnUS, ...options });
            }
            let label = formatDate(date, "PPPP");
            if (modifiers.today)
                label = `Today, ${label}`;
            if (modifiers.selected)
                label = `${label}, selected`;
            return label;
        },
        labelMonthDropdown: "Choose the Month",
        labelNext: "Go to the Next Month",
        labelPrevious: "Go to the Previous Month",
        labelWeekNumber: (weekNumber) => `Week ${weekNumber}`,
        labelYearDropdown: "Choose the Year",
        labelGrid: (date, options, dateLib) => {
            let formatDate;
            if (dateLib && typeof dateLib.format === "function") {
                formatDate = dateLib.format.bind(dateLib);
            }
            else {
                formatDate = (d, pattern) => format(d, pattern, { locale: dateFnsEnUS, ...options });
            }
            return formatDate(date, "LLLL yyyy");
        },
        labelGridcell: (date, modifiers, options, dateLib) => {
            let formatDate;
            if (dateLib && typeof dateLib.format === "function") {
                formatDate = dateLib.format.bind(dateLib);
            }
            else {
                formatDate = (d, pattern) => format(d, pattern, { locale: dateFnsEnUS, ...options });
            }
            let label = formatDate(date, "PPPP");
            if (modifiers?.today) {
                label = `Today, ${label}`;
            }
            return label;
        },
        labelNav: "Navigation bar",
        labelWeekNumberHeader: "Week Number",
        labelWeekday: (date, options, dateLib) => {
            let formatDate;
            if (dateLib && typeof dateLib.format === "function") {
                formatDate = dateLib.format.bind(dateLib);
            }
            else {
                formatDate = (d, pattern) => format(d, pattern, { locale: dateFnsEnUS, ...options });
            }
            return formatDate(date, "cccc");
        },
    },
};
