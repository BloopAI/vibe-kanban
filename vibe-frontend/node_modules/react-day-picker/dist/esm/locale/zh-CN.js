import { zhCN as dateFnsZhCN } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Chinese (Simplified) locale extended with DayPicker-specific translations. */
export const zhCN = {
    ...dateFnsZhCN,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `今天，${label}`;
            if (modifiers.selected)
                label = `${label}，已选择`;
            return label;
        },
        labelMonthDropdown: "选择月份",
        labelNext: "前往下个月",
        labelPrevious: "前往上个月",
        labelWeekNumber: (weekNumber) => `第 ${weekNumber} 周`,
        labelYearDropdown: "选择年份",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `今天，${label}`;
            }
            return label;
        },
        labelNav: "导航栏",
        labelWeekNumberHeader: "周数",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
