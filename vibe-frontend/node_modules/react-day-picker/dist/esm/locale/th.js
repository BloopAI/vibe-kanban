import { th as dateFnsTh } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Thai locale extended with DayPicker-specific translations. */
export const th = {
    ...dateFnsTh,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `วันนี้, ${label}`;
            if (modifiers.selected)
                label = `${label}, เลือกแล้ว`;
            return label;
        },
        labelMonthDropdown: "เลือกเดือน",
        labelNext: "ไปเดือนถัดไป",
        labelPrevious: "ไปเดือนก่อนหน้า",
        labelWeekNumber: (weekNumber) => `สัปดาห์ ${weekNumber}`,
        labelYearDropdown: "เลือกปี",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `วันนี้, ${label}`;
            }
            return label;
        },
        labelNav: "แถบนำทาง",
        labelWeekNumberHeader: "หมายเลขสัปดาห์",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
