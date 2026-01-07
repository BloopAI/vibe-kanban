/** Given date & time information with optional yearRange & format, returns props for DateElement
 *
 * @param date - Object containing date with optional time information
 * @param time - Determines whether to include time or not
 * @param [yearRange=[1900, new Date().getFullYear() + 2]] - Controls the list of years to be displayed
 * @param [format='YMD'] - Controls the order in which day, month and year input element will be displayed
 * @returns Array of props for DateElement
 */
export default function getDateElementProps(date, time, yearRange = [1900, new Date().getFullYear() + 2], format = 'YMD') {
    const { day, month, year, hour, minute, second } = date;
    const dayObj = { type: 'day', range: [1, 31], value: day };
    const monthObj = { type: 'month', range: [1, 12], value: month };
    const yearObj = { type: 'year', range: yearRange, value: year };
    const dateElementProp = [];
    switch (format) {
        case 'MDY':
            dateElementProp.push(monthObj, dayObj, yearObj);
            break;
        case 'DMY':
            dateElementProp.push(dayObj, monthObj, yearObj);
            break;
        case 'YMD':
        default:
            dateElementProp.push(yearObj, monthObj, dayObj);
    }
    if (time) {
        dateElementProp.push({ type: 'hour', range: [0, 23], value: hour }, { type: 'minute', range: [0, 59], value: minute }, { type: 'second', range: [0, 59], value: second });
    }
    return dateElementProp;
}
//# sourceMappingURL=getDateElementProps.js.map