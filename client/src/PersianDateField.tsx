import { useState } from "react";
import { normalizeDigits } from "./digits";
import { displayPersianDate, parsePersianDate } from "./persian-date";

interface PersianDateFieldProps {
  name: string;
  label?: string;
  required?: boolean;
  dateTime?: boolean;
  defaultValue?: string | null;
  className?: string;
  ariaLabel?: string;
}

/**
 * Persian-calendar input with an ISO hidden value for the existing API.
 * Native date inputs are deliberately avoided because their calendar and
 * keyboard vary by browser and often fall back to Gregorian in RTL browsers.
 */
export function PersianDateField({
  name,
  label,
  required = false,
  dateTime = false,
  defaultValue,
  className = "field",
  ariaLabel,
}: PersianDateFieldProps) {
  const initialDisplay = displayPersianDate(defaultValue, dateTime);
  const [displayValue, setDisplayValue] = useState(initialDisplay);
  const [isoValue, setIsoValue] = useState(
    defaultValue && !initialDisplay
      ? ""
      : parsePersianDate(initialDisplay, dateTime) ?? defaultValue ?? "",
  );
  const valid = !displayValue || Boolean(isoValue);
  return (
    <label className={className}>
      {label && <span>{label}</span>}
      <input
        type="text"
        inputMode="numeric"
        value={displayValue}
        required={required}
        placeholder={dateTime ? "۱۴۰۳/۰۱/۰۱ ۱۲:۰۰" : "۱۴۰۳/۰۱/۰۱"}
        aria-label={ariaLabel ?? label}
        aria-invalid={!valid}
        autoComplete="off"
        dir="ltr"
        onChange={(event) => {
          const next = normalizeDigits(event.target.value);
          setDisplayValue(next);
          setIsoValue(parsePersianDate(next, dateTime) ?? "");
        }}
        onBlur={() => {
          const parsed = parsePersianDate(displayValue, dateTime);
          if (parsed) setDisplayValue(displayPersianDate(parsed, dateTime));
        }}
      />
      <input type="hidden" name={name} value={isoValue} readOnly />
      <small className="field-hint">تقویم رسمی شمسی — قالب {dateTime ? "تاریخ و ساعت" : "تاریخ"}</small>
    </label>
  );
}
