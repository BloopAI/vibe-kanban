import { ko as dateFnsKo } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Korean locale extended with DayPicker-specific translations. */
export const ko = {
    ...dateFnsKo,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `오늘, ${label}`;
            if (modifiers.selected)
                label = `${label}, 선택됨`;
            return label;
        },
        labelMonthDropdown: "월 선택",
        labelNext: "다음 달로 이동",
        labelPrevious: "이전 달로 이동",
        labelWeekNumber: (weekNumber) => `주 ${weekNumber}`,
        labelYearDropdown: "연도 선택",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `오늘, ${label}`;
            }
            return label;
        },
        labelNav: "탐색 모음",
        labelWeekNumberHeader: "주 번호",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
