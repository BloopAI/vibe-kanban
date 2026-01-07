import { vi as dateFnsVi } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Vietnamese locale extended with DayPicker-specific translations. */
export const vi = {
    ...dateFnsVi,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Hôm nay, ${label}`;
            if (modifiers.selected)
                label = `${label}, đã chọn`;
            return label;
        },
        labelMonthDropdown: "Chọn tháng",
        labelNext: "Đến tháng tiếp theo",
        labelPrevious: "Đến tháng trước",
        labelWeekNumber: (weekNumber) => `Tuần ${weekNumber}`,
        labelYearDropdown: "Chọn năm",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Hôm nay, ${label}`;
            }
            return label;
        },
        labelNav: "Thanh điều hướng",
        labelWeekNumberHeader: "Số tuần",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
