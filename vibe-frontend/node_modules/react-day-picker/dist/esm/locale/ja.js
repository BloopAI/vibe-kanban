import { ja as dateFnsJa } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Japanese locale extended with DayPicker-specific translations. */
export const ja = {
    ...dateFnsJa,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `今日、${label}`;
            if (modifiers.selected)
                label = `${label}、選択済み`;
            return label;
        },
        labelMonthDropdown: "月を選択",
        labelNext: "次の月へ",
        labelPrevious: "前の月へ",
        labelWeekNumber: (weekNumber) => `第${weekNumber}週`,
        labelYearDropdown: "年を選択",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `今日、${label}`;
            }
            return label;
        },
        labelNav: "ナビゲーションバー",
        labelWeekNumberHeader: "週番号",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
