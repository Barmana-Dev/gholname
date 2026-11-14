import { normalizeDigits } from "./digits";

const GREGORIAN_MONTH_DAYS = [
  31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
];
const JALALI_MONTH_DAYS = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29];
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

const pad = (value: number) => String(value).padStart(2, "0");
const floor = Math.floor;

function gregorianLeap(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function jalaliToGregorianParts(
  year: number,
  month: number,
  day: number,
): [number, number, number] {
  const jy = year - 979;
  let dayNumber =
    365 * jy + floor(jy / 33) * 8 + floor(((jy % 33) + 3) / 4);
  for (let index = 0; index < month - 1; index += 1)
    dayNumber += JALALI_MONTH_DAYS[index];
  dayNumber += day - 1;

  let gregorianDayNumber = dayNumber + 79;
  let gy = 1600 + 400 * floor(gregorianDayNumber / 146097);
  gregorianDayNumber %= 146097;
  if (gregorianDayNumber >= 36525) {
    gregorianDayNumber -= 1;
    gy += 100 * floor(gregorianDayNumber / 36524);
    gregorianDayNumber %= 36524;
    if (gregorianDayNumber >= 365) gregorianDayNumber += 1;
  }
  gy += 4 * floor(gregorianDayNumber / 1461);
  gregorianDayNumber %= 1461;
  if (gregorianDayNumber >= 366) {
    gy += floor((gregorianDayNumber - 1) / 365);
    gregorianDayNumber = (gregorianDayNumber - 1) % 365;
  }
  let monthIndex = 0;
  while (
    monthIndex < 11 &&
    gregorianDayNumber >=
      GREGORIAN_MONTH_DAYS[monthIndex] +
        (monthIndex === 1 && gregorianLeap(gy) ? 1 : 0)
  ) {
    gregorianDayNumber -=
      GREGORIAN_MONTH_DAYS[monthIndex] +
      (monthIndex === 1 && gregorianLeap(gy) ? 1 : 0);
    monthIndex += 1;
  }
  return [gy, monthIndex + 1, gregorianDayNumber + 1];
}

function gregorianToJalaliParts(
  year: number,
  month: number,
  day: number,
): [number, number, number] {
  const leap = gregorianLeap(year);
  const adjustedYear = year - 1600;
  let dayNumber =
    365 * adjustedYear +
    floor((adjustedYear + 3) / 4) -
    floor((adjustedYear + 99) / 100) +
    floor((adjustedYear + 399) / 400);
  for (let index = 0; index < month - 1; index += 1)
    dayNumber += GREGORIAN_MONTH_DAYS[index];
  if (leap && month > 2) dayNumber += 1;
  dayNumber += day - 1;

  let jalaliDayNumber = dayNumber - 79;
  let jy = 979 + 33 * floor(jalaliDayNumber / 12053);
  jalaliDayNumber %= 12053;
  jy += 4 * floor(jalaliDayNumber / 1461);
  jalaliDayNumber %= 1461;
  if (jalaliDayNumber >= 366) {
    jy += floor((jalaliDayNumber - 1) / 365);
    jalaliDayNumber = (jalaliDayNumber - 1) % 365;
  }
  let monthIndex = 0;
  while (
    monthIndex < 11 &&
    jalaliDayNumber >= JALALI_MONTH_DAYS[monthIndex]
  ) {
    jalaliDayNumber -= JALALI_MONTH_DAYS[monthIndex];
    monthIndex += 1;
  }
  return [jy, monthIndex + 1, jalaliDayNumber + 1];
}

export function toPersianDigits(value: string): string {
  return value.replace(/[0-9]/g, (digit) => PERSIAN_DIGITS[Number(digit)]);
}

export function jalaliToGregorian(
  year: number,
  month: number,
  day: number,
): string | null {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    year < 1200 ||
    year > 1600 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  )
    return null;
  const [gy, gm, gd] = jalaliToGregorianParts(year, month, day);
  const [jy, jm, jd] = gregorianToJalaliParts(gy, gm, gd);
  if (jy !== year || jm !== month || jd !== day) return null;
  return `${String(gy).padStart(4, "0")}-${pad(gm)}-${pad(gd)}`;
}

export function gregorianToJalali(value: string): string | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  )
    return null;
  const [jy, jm, jd] = gregorianToJalaliParts(year, month, day);
  return `${jy}/${pad(jm)}/${pad(jd)}`;
}

function parseParts(value: string): {
  date: [number, number, number];
  time: string;
} | null {
  const normalized = normalizeDigits(value).trim();
  const match = normalized.match(
    /^(\d{4})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{1,2})(?:\s+|T)?(\d{1,2})?(?::(\d{2}))?$/,
  );
  if (!match) return null;
  const hour = match[4] === undefined ? undefined : Number(match[4]);
  const minute = match[5] === undefined ? 0 : Number(match[5]);
  if (
    hour !== undefined &&
    (hour < 0 || hour > 23 || minute < 0 || minute > 59)
  )
    return null;
  return {
    date: [Number(match[1]), Number(match[2]), Number(match[3])],
    time: hour === undefined ? "" : `T${pad(hour)}:${pad(minute)}`,
  };
}

export function parsePersianDate(
  value: string,
  dateTime = false,
): string | null {
  const parts = parseParts(value);
  if (!parts || (dateTime && !parts.time) || (!dateTime && parts.time))
    return null;
  const date = jalaliToGregorian(...parts.date);
  return date ? `${date}${parts.time}` : null;
}

export function displayPersianDate(
  value?: string | null,
  dateTime = false,
): string {
  if (!value) return "";
  const normalized = normalizeDigits(value).trim();
  const parsed = parseParts(normalized);
  if (parsed) {
    const iso = parsePersianDate(normalized, Boolean(parsed.time));
    if (iso) {
      const date = gregorianToJalali(iso.slice(0, 10));
      if (date)
        return toPersianDigits(
          `${date}${dateTime && parsed.time ? ` ${parsed.time.slice(1)}` : ""}`,
        );
    }
  }
  const date = gregorianToJalali(normalized.slice(0, 10));
  if (!date) return "";
  const time = normalized.match(/T(\d{2}:\d{2})/)?.[1] ?? "";
  return toPersianDigits(`${date}${dateTime && time ? ` ${time}` : ""}`);
}
