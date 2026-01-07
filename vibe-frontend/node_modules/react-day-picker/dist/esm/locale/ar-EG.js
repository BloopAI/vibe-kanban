import { arEG as dateFnsArEG } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Arabic (Egypt) locale extended with DayPicker-specific translations. */
export const arEG = {
    ...dateFnsArEG,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `اليوم، ${label}`;
            if (modifiers.selected)
                label = `${label}، محدد`;
            return label;
        },
        labelMonthDropdown: "اختر الشهر",
        labelNext: "اذهب إلى الشهر التالي",
        labelPrevious: "اذهب إلى الشهر السابق",
        labelWeekNumber: (weekNumber) => `الأسبوع ${weekNumber}`,
        labelYearDropdown: "اختر السنة",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `اليوم، ${label}`;
            }
            return label;
        },
        labelNav: "شريط التنقل",
        labelWeekNumberHeader: "رقم الأسبوع",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
