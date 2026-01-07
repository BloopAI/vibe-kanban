import { toDate } from "date-fns";
import { toGregorianDate, toHebrewDate } from "../utils/dateConversion.js";
export function eachYearOfInterval(interval) {
    const start = toDate(interval.start);
    const end = toDate(interval.end);
    if (end.getTime() < start.getTime()) {
        return [];
    }
    const startYear = toHebrewDate(start).year;
    const endYear = toHebrewDate(end).year;
    const years = [];
    for (let year = startYear; year <= endYear; year += 1) {
        years.push(toGregorianDate({ year, monthIndex: 0, day: 1 }));
    }
    return years;
}
