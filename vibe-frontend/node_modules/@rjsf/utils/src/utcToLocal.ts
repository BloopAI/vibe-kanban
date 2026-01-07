import pad from './pad';

/** Converts a UTC date string into a local Date format
 *
 * @param jsonDate - A UTC date string
 * @returns - An empty string when `jsonDate` is falsey, otherwise a date string in local format
 */
export default function utcToLocal(jsonDate: string) {
  if (!jsonDate) {
    return '';
  }

  // required format of `'yyyy-MM-ddThh:mm' followed by optional ':ss' or ':ss.SSS'
  // https://html.spec.whatwg.org/multipage/input.html#local-date-and-time-state-(type%3Ddatetime-local)
  // > should be a _valid local date and time string_ (not GMT)

  // Note - date constructor passed local ISO-8601 does not correctly
  // change time to UTC in node pre-8
  const date = new Date(jsonDate);

  const yyyy = pad(date.getFullYear(), 4);
  const MM = pad(date.getMonth() + 1, 2);
  const dd = pad(date.getDate(), 2);
  const hh = pad(date.getHours(), 2);
  const mm = pad(date.getMinutes(), 2);
  const ss = pad(date.getSeconds(), 2);
  const SSS = pad(date.getMilliseconds(), 3);

  return `${yyyy}-${MM}-${dd}T${hh}:${mm}:${ss}.${SSS}`;
}
