// Turning numbers and dates into plain words for the screen.

import { formatCents } from '../maths/money.js';
import { ymd, weekday, dayNumber } from '../maths/dates.js';
import { FREQUENCIES } from '../maths/schedule.js';

export const money = formatCents;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function monthLabel(y, m) {
  return `${MONTHS[m - 1]} ${y}`;
}

export function monthName(m) {
  return MONTHS[m - 1];
}

/** "Fri, Nov 14" (adds the year if it isn't this year) */
export function dayLabel(day, thisYear = null) {
  const { y, m, d } = ymd(day);
  const base = `${DAYS[weekday(day)]}, ${MONTHS[m - 1].slice(0, 3)} ${d}`;
  return thisYear && y !== thisYear ? `${base}, ${y}` : base;
}

export function dateLabel(iso, thisYear = null) {
  return dayLabel(dayNumber(iso), thisYear);
}

export function whenLabel(daysAway) {
  if (daysAway === 0) return 'today';
  if (daysAway === 1) return 'tomorrow';
  return `in ${daysAway} days`;
}

/** "$50.00 every week", "$900.00 one time" */
export function howOften(entry) {
  const f = FREQUENCIES[entry.freq];
  if (entry.freq === 'once') return `${money(entry.amountCents)} one time`;
  if (entry.freq === 'varies') return money(entry.amountCents);
  return `${money(entry.amountCents)} ${f.label.toLowerCase()}`;
}

export function plural(n, word, many = `${word}s`) {
  return `${n} ${n === 1 ? word : many}`;
}
