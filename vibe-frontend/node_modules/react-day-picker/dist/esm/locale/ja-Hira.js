import { jaHira as dateFnsJaHira } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Japanese (Hiragana) locale extended with DayPicker-specific translations. */
export const jaHira = {
    ...dateFnsJaHira,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `きょう、${label}`;
            if (modifiers.selected)
                label = `${label}、せんたくずみ`;
            return label;
        },
        labelMonthDropdown: "つきをえらぶ",
        labelNext: "つぎのつきへ",
        labelPrevious: "まえのつきへ",
        labelWeekNumber: (weekNumber) => `しゅう ${weekNumber}`,
        labelYearDropdown: "としをえらぶ",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `きょう、${label}`;
            }
            return label;
        },
        labelNav: "ナビゲーションバー",
        labelWeekNumberHeader: "しゅうばんごう",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
