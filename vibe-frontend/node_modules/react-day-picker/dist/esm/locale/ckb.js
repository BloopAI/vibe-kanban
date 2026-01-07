import { ckb as dateFnsCkb } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/**
 * Central Kurdish (Sorani) locale extended with DayPicker-specific
 * translations.
 */
export const ckb = {
    ...dateFnsCkb,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `ئەمڕۆ، ${label}`;
            if (modifiers.selected)
                label = `${label}، هەڵبژێرا`;
            return label;
        },
        labelMonthDropdown: "مانگ هەڵبژێرە",
        labelNext: "بڕۆ بۆ مانگی داهاتوو",
        labelPrevious: "بڕۆ بۆ مانگی پێشوو",
        labelWeekNumber: (weekNumber) => `هەفتە ${weekNumber}`,
        labelYearDropdown: "ساڵ هەڵبژێرە",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `ئەمڕۆ، ${label}`;
            }
            return label;
        },
        labelNav: "شریتی ڕاڕەوێژ",
        labelWeekNumberHeader: "ژمارەی هەفتە",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
